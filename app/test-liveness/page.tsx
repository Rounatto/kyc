"use client";

import { useState } from "react";
import LivenessCapture, { type LivenessResult } from "@/components/liveness-capture";

export default function TestLiveness() {
    const [result, setResult] = useState<LivenessResult | null>(null);

    return (
        <div className="max-w-md mx-auto p-8">
            <LivenessCapture onResult={setResult} />

            <pre className="mt-6 text-xs bg-gray-100 text-gray-800 p-4 rounded overflow-auto">
                {result
                    ? JSON.stringify(
                          result.status === "captured"
                              ? {
                                    status: result.status,
                                    attempts: result.attempts,
                                    instructions: result.instructions,
                                    token: result.token.slice(0, 45) + "...",
                                    frames: result.frames.map((f) => ({
                                        kind: f.kind,
                                        path: f.path,
                                    })),
                                }
                              : result,
                          null,
                          2
                      )
                    : "null"}
            </pre>
        </div>
    );
}