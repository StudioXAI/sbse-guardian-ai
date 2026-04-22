"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

const riskData = [
  { name: "Safe", value: 35 },
  { name: "Warning", value: 40 },
  { name: "Critical", value: 25 },
];

const findingsData = [
  { name: "DEX", score: 9 },
  { name: "Liquidity", score: 7 },
  { name: "Holders", score: 6 },
  { name: "Proxy", score: 5 },
  { name: "Honeypot", score: 4 },
];

export default function AuditVisualDashboard() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Risk Distribution */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-2xl font-bold mb-4">
          Risk Distribution
        </h3>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={riskData}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label
              >
                {riskData.map((entry, index) => (
                  <Cell key={index} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security Layer Scores */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-2xl font-bold mb-4">
          Security Layer Scores
        </h3>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={findingsData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SbSe Shield Summary */}
      <div className="md:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-2xl font-bold mb-6">
          SbSe Shield Summary
        </h3>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm text-white/60">DEX Status</p>
            <p className="text-lg font-semibold">Verified</p>
          </div>

          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm text-white/60">Liquidity</p>
            <p className="text-lg font-semibold">Detected</p>
          </div>

          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm text-white/60">Holder Risk</p>
            <p className="text-lg font-semibold">Medium</p>
          </div>

          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-sm text-white/60">SbSe Shield</p>
            <p className="text-lg font-semibold">10+</p>
          </div>
        </div>
      </div>
    </div>
  );
}