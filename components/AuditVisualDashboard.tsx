"use client";

import React from "react";
import { motion } from "framer-motion";

export default function AuditVisualDashboard({
  report,
}: {
  report: any;
}) {
  const riskScore = report?.riskScore || 0;
  const professionalScore = report?.professionalScore || 0;
  const findingsCount = report?.findings?.length || 0;

  const securityGrade =
    riskScore <= 2
      ? "A+"
      : riskScore <= 4
      ? "A"
      : riskScore <= 6
      ? "B"
      : riskScore <= 8
      ? "C"
      : "D";

  const riskStatus =
    riskScore <= 3
      ? "Low Risk"
      : riskScore <= 6
      ? "Medium Risk"
      : "High Risk";

  const metricCards = [
    {
      title: "OVERALL RISK SCORE",
      value: String(riskScore * 10),
      suffix: "/100",
      status: riskStatus,
    },
    {
      title: "CONTRACT SCAN",
      value: "Live",
      suffix: "",
      status: "Completed",
    },
    {
      title: "CHECKS PERFORMED",
      value: String(findingsCount),
      suffix: "",
      status: "Security Checks",
    },
    {
      title: "SECURITY GRADE",
      value: securityGrade,
      suffix: "",
      status: "Dynamic Grade",
    },
  ];

  const securityLayers = [
    [
      "DEX Analysis",
      `${professionalScore} / 10`,
      "Live",
      `${professionalScore * 10}%`,
    ],
    [
      "Liquidity Analysis",
      `${10 - riskScore} / 10`,
      "Live",
      `${(10 - riskScore) * 10}%`,
    ],
    [
      "Holder Analysis",
      `${10 - riskScore} / 10`,
      "Live",
      `${(10 - riskScore) * 10}%`,
    ],
    [
      "Proxy Detection",
      `${professionalScore} / 10`,
      "Live",
      `${professionalScore * 10}%`,
    ],
    [
      "Honeypot Detection",
      `${professionalScore} / 10`,
      "Live",
      `${professionalScore * 10}%`,
    ],
  ];

  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-black p-8 shadow-2xl">
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-70 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:140px_140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%)]" />

        <motion.div
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute top-[18%] left-[20%] h-2 w-2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)]"
        />

        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
          className="absolute top-[30%] right-[18%] h-2 w-2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)]"
        />
      </div>

      <div className="relative z-10">
        <h2 className="text-5xl font-bold text-white mb-3 leading-tight">
          Powered by SbSe Protocol
          <br />
          Institutional-Grade AI Security Intelligence
        </h2>

        <p className="text-white/70 text-lg mb-10">
          Advanced Smart Contract, Token, Liquidity &
          Investor Protection Analysis
        </p>

        {/* Top Metric Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {metricCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl p-6 transition-all duration-500 hover:scale-[1.02] hover:border-green-400/30"
            >
              <p className="text-xs text-white/60 mb-3">
                {card.title}
              </p>

              <div className="flex items-end gap-1">
                <h3 className="text-4xl font-bold text-white">
                  {card.value}
                </h3>

                <span className="text-white/50 mb-1">
                  {card.suffix}
                </span>
              </div>

              <p className="text-sm text-green-400 mt-2">
                {card.status}
              </p>
            </div>
          ))}
        </div>

        {/* Main Panels */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Risk Distribution */}
          <div className="rounded-3xl border border-white/10 bg-black/70 p-8">
            <h3 className="text-2xl font-bold text-white mb-6">
              Risk Distribution
            </h3>

            <div className="flex items-center justify-center py-8">
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

                <div className="absolute inset-[26px] rounded-full bg-black border border-white/10" />
                <div className="absolute inset-[52px] rounded-full border border-white/5" />

                <div className="absolute inset-[78px] rounded-full bg-black border border-white/10 flex items-center justify-center text-center">
                  <div>
                    <p className="text-white/50 text-sm">
                      TOTAL FINDINGS
                    </p>

                    <p className="text-4xl font-bold text-white">
                      {findingsCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Layers */}
          <div className="rounded-3xl border border-white/10 bg-black/70 p-8">
            <h3 className="text-2xl font-bold text-white mb-6">
              Security Layer Scores
            </h3>

            <div className="space-y-5">
              {securityLayers.map(
                ([title, score, label, width]) => (
                  <div key={title}>
                    <div className="flex justify-between mb-2">
                      <span className="text-white">
                        {title}
                      </span>

                      <span className="text-white/80">
                        {score}
                      </span>
                    </div>

                    <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-400"
                        style={{ width: `${width}` }}
                      />
                    </div>

                    <p className="text-sm text-green-400 mt-1">
                      {label}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Bottom Feature Cards */}
        <div className="grid gap-4 md:grid-cols-4 mt-8">
          {[
            ["AI-Powered Security", "Advanced machine learning"],
            ["Real-Time Protection", "Live blockchain monitoring"],
            ["Lightning Fast", "Completed in seconds"],
            ["Investor Protection", "Bank-grade security"],
          ].map(([title, text]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-black/70 p-5"
            >
              <p className="text-lg font-semibold text-white">
                {title}
              </p>

              <p className="text-sm text-white/60 mt-2">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}