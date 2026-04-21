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
