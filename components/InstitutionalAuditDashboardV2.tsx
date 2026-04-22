export default function InstitutionalAuditDashboardV2({
  report,
}: {
  report: any;
}) {
  const riskScore = report?.riskScore || 0;
  const professionalScore = report?.professionalScore || 0;
  const professionalLabel =
    report?.professionalLabel || "Unknown";
  const rugPullProbability =
    report?.rugPullProbability || 0;
  const rugPullRisk =
    report?.rugPullRisk || "Unknown";
  const findings = report?.findings || [];
  const verified = report?.isSbSeVerified || false;

  const securityGrade = (() => {
    if (riskScore <= 2) return "A+";
    if (riskScore <= 4) return "A";
    if (riskScore <= 6) return "B";
    if (riskScore <= 8) return "C";
    return "D";
  })();

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h2 className="text-3xl font-bold">
          Audit Report
        </h2>

        <p className="mt-4 text-white/70">
          Project:{" "}
          <span className="font-semibold text-white">
            {report?.project || "Unknown"}
          </span>
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard
          title="Risk Score"
          value={`${riskScore}/10`}
          subtitle="Overall Contract Risk"
        />

        <MetricCard
          title="Professional Score"
          value={`${professionalScore}/10`}
          subtitle={professionalLabel}
        />

        <MetricCard
          title="Rug Pull Probability"
          value={`${rugPullProbability}%`}
          subtitle={rugPullRisk}
        />

        <MetricCard
          title="Security Grade"
          value={securityGrade}
          subtitle="Institutional Grade"
        />
      </div>

      {verified ? (
        <div className="rounded-3xl border border-green-400/20 bg-green-500/5 p-8">
          <h3 className="text-2xl font-bold text-green-400">
            🛡 SbSe Shield Active
          </h3>

          <p className="mt-3 text-white/80">
            Verified Launchpad Project
          </p>

          <p className="text-white/60">
            Protected by SbSe Protocol
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-yellow-400/20 bg-yellow-500/5 p-8">
          <h3 className="text-xl font-bold text-yellow-300">
            ⚠ Not Verified by SbSe Protocol
          </h3>

          <p className="mt-3 text-white/70">
            This token is not listed on INFI
            MultiChain CDEX or INFI Launchpad.
            Additional due diligence is strongly
            recommended.
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <h3 className="text-2xl font-bold mb-4">
          Findings
        </h3>

        <div className="space-y-3">
          {findings.map(
            (item: string, index: number) => (
              <div
                key={index}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                {item}
              </div>
            )
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-white/70">
          {report?.beginnerExplanation}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <p className="text-sm text-white/60">
        {title}
      </p>

      <h3 className="text-3xl font-bold mt-3">
        {value}
      </h3>

      <p className="text-sm text-white/60 mt-2">
        {subtitle}
      </p>
    </div>
  );
}