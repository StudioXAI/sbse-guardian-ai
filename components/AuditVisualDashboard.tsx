"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const COLORS = ["#22c55e", "#f59e0b", "#ef4444"];

const riskData = [
  { name: "Safe", value: 32 },
  { name: "Warning", value: 43 },
  { name: "Critical", value: 25 },
];

const findingsData = [
  { name: "DEX", score: 9.2 },
  { name: "Liquidity", score: 8.6 },
  { name: "Holders", score: 6.8 },
  { name: "Proxy", score: 5.6 },
  { name: "Honeypot", score: 4.2 },
];

export default function AuditVisualDashboard() {
  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-black p-8 shadow-2xl">
      {/* Grid motion background */}
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:120px_120px]" />

        <motion.div
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] left-[15%] h-2 w-2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        />

        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[35%] right-[20%] h-2 w-2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        />

        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[25%] left-[45%] h-2 w-2 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        />
      </div>

      <div className="relative z-10">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-10">
          Sherlock-Style Security Intelligence
        </h2>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl p-7 transition-all duration-500 hover:scale-[1.02] hover:border-green-400/30">
            <h3 className="text-2xl font-bold text-white mb-5">Risk Distribution</h3>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={78}
                    outerRadius={118}
                    paddingAngle={5}
                    stroke="#050505"
                    strokeWidth={2}
                    label
                  >
                    {riskData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl p-7 transition-all duration-500 hover:scale-[1.02] hover:border-green-400/30">
            <h3 className="text-2xl font-bold text-white mb-5">Security Layer Scores</h3>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={findingsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" stroke="#ffffff" />
                  <YAxis stroke="#ffffff" />
                  <Tooltip />
                  <Bar dataKey="score" fill="#22c55e" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
