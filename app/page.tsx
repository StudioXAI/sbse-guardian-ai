export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="w-full border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">SbSe Guardian AI</h1>
            <p className="text-xs text-white/60">
              Smart Contract Auditor Agent
            </p>
          </div>

          <button className="px-5 py-2 rounded-xl bg-white text-black font-medium">
            Launch App
          </button>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-4xl">
          <div className="inline-flex px-4 py-2 rounded-full border border-white/20 mb-6">
            🛡 SbSe Shield Protected
          </div>

          <h2 className="text-5xl md:text-7xl font-bold leading-tight">
            Don’t Audit Code.
            <br />
            Ask the Agent.
          </h2>

          <p className="mt-6 text-lg text-white/70 max-w-2xl">
            Analyze any smart contract across any chain.
            Detect rug pulls, honeypots, hidden risks, and scam patterns —
            explained in simple language anyone can understand.
          </p>

          <div className="mt-10 flex gap-4">
            <button className="px-6 py-4 rounded-2xl bg-white text-black font-semibold">
              Start Free Trial
            </button>

            <button className="px-6 py-4 rounded-2xl border border-white/20">
              View Demo Report
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="w-full border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">SbSe Guardian AI</h1>
            <p className="text-xs text-white/60">
              Smart Contract Auditor Agent
            </p>
          </div>

          <button className="px-5 py-2 rounded-xl bg-white text-black font-medium">
            Launch App
          </button>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-4xl">
          <div className="inline-flex px-4 py-2 rounded-full border border-white/20 mb-6">
            🛡 SbSe Shield Protected
          </div>

          <h2 className="text-5xl md:text-7xl font-bold leading-tight">
            Don’t Audit Code.
            <br />
            Ask the Agent.
          </h2>

          <p className="mt-6 text-lg text-white/70 max-w-2xl">
            Analyze any smart contract across any chain.
            Detect rug pulls, honeypots, hidden risks, and scam patterns —
            explained in simple language anyone can understand.
          </p>

          <div className="mt-10 flex gap-4">
            <button className="px-6 py-4 rounded-2xl bg-white text-black font-semibold">
              Start Free Trial
            </button>

            <button className="px-6 py-4 rounded-2xl border border-white/20">
              View Demo Report
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <div className="mb-6">
            <p className="text-sm uppercase tracking-widest text-white/50">
              Live Contract Scanner
            </p>
            <h3 className="text-3xl font-bold mt-2">
              Analyze Any Smart Contract
            </h3>
            <p className="text-white/70 mt-3 max-w-2xl">
              Paste a token address, smart contract address, or project website.
              SbSe Guardian AI will detect hidden risks, scam patterns, and explain everything in simple language.
            </p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Paste contract address or website URL..."
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none"
            />

            <div className="flex flex-wrap gap-4">
              <button className="px-6 py-4 rounded-2xl bg-white text-black font-semibold">
                Scan Contract
              </button>

              <button className="px-6 py-4 rounded-2xl border border-white/20">
                Example Audit Report
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
