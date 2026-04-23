// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SbSe Guardian Audit Registry
 * @notice Permanent, on-chain audit proof record.
 *
 * Anyone can mint a record by calling recordAudit() with a valid
 * signature from the SbSe Guardian signing key. Caller pays gas.
 *
 * Deployed to Base for low fees (~$0.001 per record).
 *
 * Each audit proof is a keccak256 hash of the full audit JSON.
 * Anyone can verify later by recomputing the hash from the stored
 * audit data and comparing against the on-chain record.
 */
contract AuditRegistry {
    /* ─────── State ─────── */

    /// @dev Address of the SbSe Guardian signing key.
    ///      Changed via transferSigner() by current signer.
    address public signer;

    struct AuditRecord {
        bytes32 auditHash;   // keccak256 of the full audit report JSON
        uint64  timestamp;   // when this audit was minted
        uint64  riskScore;   // 1-10, lower is safer
        uint64  rugProbability; // 0-100 percent
        address signer;      // who signed this record
    }

    /// @dev contractAddress => latest audit record
    mapping(address => AuditRecord) public latestAudit;

    /// @dev contractAddress => all historical audit hashes (append-only)
    mapping(address => bytes32[]) public auditHistory;

    /// @dev Total number of audits ever recorded
    uint256 public totalAudits;

    /* ─────── Events ─────── */

    event AuditRecorded(
        address indexed scannedContract,
        bytes32 indexed auditHash,
        uint256 riskScore,
        uint256 rugProbability,
        address indexed by,
        uint256 timestamp
    );

    event SignerTransferred(address indexed previous, address indexed next);

    /* ─────── Errors ─────── */

    error InvalidSignature();
    error OnlySigner();
    error ZeroAddress();

    /* ─────── Constructor ─────── */

    constructor(address _signer) {
        if (_signer == address(0)) revert ZeroAddress();
        signer = _signer;
    }

    /* ─────── External ─────── */

    /**
     * @notice Record an audit proof on-chain.
     * @param scannedContract The contract that was audited.
     * @param auditHash keccak256 of the JSON audit report.
     * @param riskScore 1-10 risk score.
     * @param rugProbability 0-100 percent.
     * @param sig ECDSA signature of (scannedContract, auditHash, riskScore, rugProbability, chainId)
     *            produced by the SbSe Guardian signer key.
     *
     * Caller pays gas. Anyone can mint as long as the signature is valid.
     */
    function recordAudit(
        address scannedContract,
        bytes32 auditHash,
        uint64 riskScore,
        uint64 rugProbability,
        bytes calldata sig
    ) external {
        bytes32 digest = keccak256(
            abi.encode(
                scannedContract,
                auditHash,
                riskScore,
                rugProbability,
                block.chainid,
                address(this)
            )
        );

        // EIP-191 personal_sign prefix
        bytes32 ethSigned = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );

        address recovered = _recover(ethSigned, sig);
        if (recovered != signer) revert InvalidSignature();

        latestAudit[scannedContract] = AuditRecord({
            auditHash: auditHash,
            timestamp: uint64(block.timestamp),
            riskScore: riskScore,
            rugProbability: rugProbability,
            signer: recovered
        });

        auditHistory[scannedContract].push(auditHash);
        unchecked { ++totalAudits; }

        emit AuditRecorded(
            scannedContract,
            auditHash,
            riskScore,
            rugProbability,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Transfer signer privileges. Only current signer can call.
     */
    function transferSigner(address newSigner) external {
        if (msg.sender != signer) revert OnlySigner();
        if (newSigner == address(0)) revert ZeroAddress();
        address previous = signer;
        signer = newSigner;
        emit SignerTransferred(previous, newSigner);
    }

    /* ─────── Views ─────── */

    function auditCountFor(address scannedContract) external view returns (uint256) {
        return auditHistory[scannedContract].length;
    }

    function hasAudit(address scannedContract) external view returns (bool) {
        return latestAudit[scannedContract].timestamp != 0;
    }

    /* ─────── Internal ─────── */

    /**
     * @dev Recover signer from ECDSA signature.
     *      Supports both 65-byte (r, s, v) and 64-byte (r, vs) compact formats.
     */
    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(sig.offset)
                s := calldataload(add(sig.offset, 32))
                v := byte(0, calldataload(add(sig.offset, 64)))
            }
            if (v < 27) v += 27;
            if (v != 27 && v != 28) revert InvalidSignature();
            address signerAddr = ecrecover(hash, v, r, s);
            if (signerAddr == address(0)) revert InvalidSignature();
            return signerAddr;
        }
        revert InvalidSignature();
    }
}
