"use client";

import React from "react";
import { motion } from "framer-motion";

const metricCards = [
  {
    title: "OVERALL RISK SCORE",
    value: "28",
    suffix: "/100",
    status: "Low Risk",
  },
  {
    title: "CONTRACT SCAN",
    value: "12.4s",
    suffix: "",
    status: "Completed",
  },
  {
    title: "CHECKS PERFORMED",
    value: "58",
    suffix: "",
    status: "Security Checks",
  },
  {
    title: "SECURITY GRADE",
    value: "A-",
    suffix: "",
    status: "Very Good",
  },
];

const securityLayers = [
  {
    title: "DEX Analysis",
    score: "9.2 / 10",
    label: "Excellent",
    width: "92%",
  },
  {
    title: "Liquidity Analysis",
    score: "8.6 / 10",
    label: "Very Good",
    width: "86%",
  },
  {
    title: "Holder Analysis",
    score: "6.8 / 10",
    label: "Good",
    width: "68%",
  },
  {
    title: "Proxy Detection",
    score: "5.6 / 10",
    label: "Medium",
    width: "56%",
  },
  {
    title: "Honeypot Detection",
    score: "4.2 / 10",
    label: "Low",
    width: "42%",
  },
];

const featureCards = [
  {
    title: "AI-Powered Security",
    text: "Advanced machine learning models detect threats",
  },
  {
    title: "Real-Time Protection",
    text: "Live blockchain monitoring & threat intelligence",
  },
  {
    title: "Lightning Fast",
    text: "Comprehensive analysis completed in seconds",
  },
  {
    title: "Investor Protection",
    text: "Bank-grade security for your DeFi investments",
  },
];

export default function AuditVisualDashboard() {
  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-black p-8 shadow-2xl">
      {/* Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-80">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:120px_120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%)]" />

        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute top-[20%] left-[18%] h-2 w-2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        />

        <motion.div
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
          className="absolute top-[35%] right-[20%] h-2 w-2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <h2 className="text-5xl font-bold text-white mb-3">
          Sherlock-Style Security Intelligence
        </h2>

        <p className="text-white/70 text-lg mb-10">
          Advanced AI-Powered Smart Contract & Token Security Analysis
        </p>

        {/* Top Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {metricCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl p-6 transition-all duration-500 hover:scale-[1.02] hover:border-green-400/30"
            >
              <p className="text-xs text-white/60 mb-3">
                {card.title}
              </p>

              <div className="flex items-end gap-2">
                <h3 className="text-4xl font-bold text-white">
                  {card.value}
                </h3>

                <span className="text-white/50 mb-1">
                  {card.suffix}
                </span>
              </div>

              <p className="text-sm mt-2 text-green-400">
                {card.status}
              </p>
            </div>
          ))}
        </div>

        {/* Main Panels */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Donut */}
          <div className="rounded-3xl border border-white/10 bg-black/70 p-8">
            <h3 className="text-2xl font-bold text-white mb-6">
              Risk Distribution
            </h3>

            <div className="flex justify-center items-center py-8">
              <div className="relative h-[340px] w-[340px] flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      "conic-gradient(#22c55e 0% 32%, #f59e0b 32% 75%, #ef4444 75% 100%)",
                    boxShadow:
                      "0 0 40px rgba(34,197,94,0.12)",
                  }}
                />

                <div className="absolute inset-[28px] rounded-full bg-black border border-white/10" />

                <div className="absolute inset-[80px] rounded-full bg-black border border-white/10 flex items-center justify-center text-center">
                  <div>
                    <p className="text-white/50 text-sm">
                      TOTAL FINDINGS
                    </p>

                    <p className="text-5xl font-bold text-white">
                      100
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Scores */}
          <div className="rounded-3xl border border-white/10 bg-black/70 p-8">
            <h3 className="text-2xl font-bold text-white mb-6">
              Security Layer Scores
            </h3>

            <div className="space-y-5">
              {securityLayers.map((item) => (
                <div key={item.title}>
                  <div className="flex justify-between mb-2">
                    <span className="text-white">
                      {item.title}
                    </span>

                    <span className="text-white/80">
                      {item.score}
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: item.width,
                        backgroundColor:
                          item.title === "DEX Analysis"
                            ? "#22c55e"
                            : item.title === "Liquidity Analysis"
                            ? "#3b82f6"
                            : item.title === "Holder Analysis"
                            ? "#a855f7"
                            : item.title === "Proxy Detection"
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    />
                  </div>

                  <p className="text-sm text-white/70 mt-1">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Cards */}
        <div className="grid gap-4 md:grid-cols-4 mt-8">
          {featureCards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-white/10 bg-black/70 p-5"
            >
              <p className="text-lg font-semibold text-white">
                {card.title}
              </p>

              <p className="text-sm text-white/60 mt-2">
                {card.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}