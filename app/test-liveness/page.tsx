"use client";

import { useState } from "react";
import LivenessCapture, { type LivenessResult } from "@/components/liveness-capture";

export default function TestLiveness() {
    const [result, setResult] = useState<LivenessResult | null>(null);

    return (
        <div className="max-w-md mx-auto p-8">
            <LivenessCapture onResult={setResult} />

            <pre className="mt-6 text-xs bg-gray-100 p-4 rounded overflow-auto">
                {result
                    ? JSON.stringify(
                          result.status === "captured"
                              ? {
                                    status: result.status,
                                    instructions: result.instructions,
                                    token: result.token.slice(0, 45) + "...",
                                    // 🆕 [ÉTAPE 3] Les chemins remplacent les tailles
                                    // de blob : c'est désormais ce que le composant
                                    // remonte réellement au formulaire.
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