"use client";

import { useState } from "react";
import LivenessCapture, { type LivenessResult } from "@/components/liveness-capture";

export default function TestLiveness() {
    const [result, setResult] = useState<LivenessResult | null>(null);
    const [verification, setVerification] = useState<any>(null);
    const [verifying, setVerifying] = useState(false);

    const verify = async () => {
        if (!result || result.status !== "captured") return;

        setVerifying(true);
        setVerification(null);

        const byKind = (kind: string) => result.frames.find((f) => f.kind === kind)?.path ?? "";

        try {
            const res = await fetch("/api/test-liveness-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: result.token,
                    paths: {
                        reference: byKind("reference"),
                        action1: byKind("action1"),
                        action2: byKind("action2"),
                    },
                }),
            });
            setVerification(await res.json());
        } catch (err: any) {
            setVerification({ error: err?.message ?? "network error" });
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="max-w-md mx-auto p-8">
            <LivenessCapture onResult={setResult} />

            {result?.status === "captured" && (
                <button
                    onClick={verify}
                    disabled={verifying}
                    className="mt-4 w-full bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
                >
                    {verifying ? "Verifying..." : "Verify this sequence"}
                </button>
            )}

            {verification && (
                <pre className="mt-4 text-xs bg-gray-100 text-gray-800 p-4 rounded overflow-auto">
                    {JSON.stringify(verification, null, 2)}
                </pre>
            )}
        </div>
    );
}