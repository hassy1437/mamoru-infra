"use client"

import { Check } from "lucide-react"

type Step = {
    label: string
    description?: string
}

interface StepIndicatorProps {
    steps: Step[]
    currentStep: number // 0-indexed
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
    return (
        <nav aria-label="進捗" className="mb-8">
            <ol className="flex items-center w-full">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep
                    const isCurrent = index === currentStep
                    const isLast = index === steps.length - 1

                    return (
                        <li
                            key={step.label}
                            className={`flex items-center ${isLast ? "" : "flex-1"}`}
                        >
                            <div className="flex flex-col items-center">
                                <div
                                    className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold transition-colors ${
                                        isCompleted
                                            ? "bg-blue-600 border-blue-600 text-white"
                                            : isCurrent
                                                ? "border-blue-600 text-blue-600 bg-blue-50"
                                                : "border-slate-300 text-slate-400 bg-white"
                                    }`}
                                >
                                    {isCompleted ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        index + 1
                                    )}
                                </div>
                                <span
                                    className={`mt-1.5 text-xs font-medium text-center leading-tight max-w-[80px] ${
                                        isCurrent
                                            ? "text-blue-600"
                                            : isCompleted
                                                ? "text-slate-600"
                                                : "text-slate-400"
                                    }`}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {!isLast && (
                                <div
                                    className={`flex-1 h-0.5 mx-2 mt-[-16px] ${
                                        isCompleted ? "bg-blue-600" : "bg-slate-200"
                                    }`}
                                />
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
