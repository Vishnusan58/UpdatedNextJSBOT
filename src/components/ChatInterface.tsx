"use client"
import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CoverageCost {
    label: string;
    value: string;
}

interface InsurancePlanProps {
    planName: string;
    premium?: string;
    coverageDetails: CoverageCost[];
}

interface Message {
    type: 'user' | 'bot';
    content: string;
    options?: string[];
    recommendations?: any[];
    summary?: string;
    plan?: InsurancePlanProps;
    currentPlan?: InsurancePlanProps;
}

const ChatInterface = () => {
    const initialPlan: InsurancePlanProps = {
        planName: "United Healthcare Oxford",
        premium: "$/month",
        coverageDetails: [
            { label: "Individual Deductible", value: "$1500" },
            { label: "Family Deductible", value: "$3000" },
            { label: "Physician Visit Copay", value: "$20" },
            { label: "Diagnostic Test Copay", value: "$0" },
            { label: "Generic Drugs Copay", value: "$10" },
            { label: "Emergency Room Care", value: "$100" },
            { label: "Maternity Coverage", value: "Full Coverage" },
            { label: "Vaccination Coverage", value: "$10 Copay" },
        ]
    };

    const [messages, setMessages] = useState<Message[]>([
        {
            type: 'bot',
            content: "Hey Alex, How can I help you? I am your personalized insurance assistant.",
        },
        {
            type: 'bot',
            content: "This is your current plan:",
            plan: initialPlan
        },
        {
            type: 'bot',
            content: "Do you like to update your plan ?",
            options: ['Yes', 'No']
        }
    ]);

    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const userId = useRef(Math.random().toString(36).substring(7));

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const [isInPlanUpdateFlow, setIsInPlanUpdateFlow] = useState(false);
    const [planUpdateCount, setPlanUpdateCount] = useState(0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMessage = inputValue;
        setInputValue('');
        setLoading(true);

        // Add user message to chat
        setMessages(prev => [...prev, { type: 'user', content: userMessage }]);

        try {
            // Check for plan update or query options
            const isUpdatePlan = userMessage === "Update the plan" || userMessage === "1";
            const isQueryPlan = userMessage === "Query about the plan" || userMessage === "2";

            // Modified: Set flow state before API selection
            if (isUpdatePlan) {
                setIsInPlanUpdateFlow(true);
                setPlanUpdateCount(1); // Start at 1 since this is first interaction
            }

            // Modified: Include isUpdatePlan in the chatbot API condition
            const shouldUseChatbotAPI = isUpdatePlan || (isInPlanUpdateFlow && planUpdateCount < 11);

            if (shouldUseChatbotAPI) {
                // Only increment counter for subsequent messages after update plan
                if (!isUpdatePlan && isInPlanUpdateFlow) {
                    setPlanUpdateCount(prev => prev + 1);
                }

                // Call chatbot API
                const response = await fetch('/api/chatbot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: userMessage,
                        userId: userId.current
                    }),
                });

                const data = await response.json();
                let botMessage: Message = { type: 'bot', content: data.message };

                // Handle different response types
                if (data.type === 'question' && data.options) {
                    botMessage.options = data.options;
                } else if (data.type === 'recommendations') {
                    botMessage.recommendations = data.recommendations;
                } else if (data.type === 'plan_selected') {
                    botMessage.summary = data.summary;
                    if (data.finalPlan) {
                        botMessage.plan = data.finalPlan;
                    }
                }else if (data.type === 'final_summary') {
                    let botMessage: Message = {
                        type: 'bot',
                        content: "Here are your recommendations:", // Removed reference to "updated plan"
                        recommendations: data.recommendations // Only add recommendations
                    };

                    // Add only the recommendations to the messages array
                    setMessages(prev => [...prev, botMessage]);

                    // Optionally reset the flow
                    setIsInPlanUpdateFlow(false);
                }

                // Reset flow if we've reached the end
                if (planUpdateCount >= 11) {
                    setIsInPlanUpdateFlow(false);
                }

                setMessages(prev => [...prev, botMessage]);
            } else {
                // Handle RAG queries for everything else
                const response = await fetch('/api/rag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: userMessage,
                        userId: userId.current,
                    }),
                });

                const data = await response.json();

                if (data.type === 'ai_response') {
                    setMessages(prev => [...prev, {
                        type: 'bot',
                        content: data.message,
                        metadata: {
                            context: data.metadata?.context,
                            confidence: data.metadata?.confidence
                        }
                    }]);
                } else if (data.type === 'error') {
                    setMessages(prev => [...prev, {
                        type: 'bot',
                        content: data.message
                    }]);
                } else if (data.type === 'form_completion') {
                    setMessages(prev => [...prev, {
                        type: 'bot',
                        content: data.message,
                        previousResponse: data.previousResponse,
                        currentResponse: data.currentResponse
                    }]);
                } else {
                    setMessages(prev => [...prev, {
                        type: 'bot',
                        content: data.message
                    }]);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, {
                type: 'bot',
                content: 'Sorry, there was an error processing your request.'
            }]);
        }

        setLoading(false);
    };

    const renderPlanCard = (plan: InsurancePlanProps, isCurrentPlan: boolean = false) => (
        <Card className="my-4 w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl font-bold text-primary">
                    {plan.planName}
                    {isCurrentPlan && " (Current)"}
                </CardTitle>
                <CardDescription>
                    Premium: <span className="font-medium">{plan.premium}</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {plan.coverageDetails.map((detail, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0"
                        >
                            <span className="text-sm text-muted-foreground">
                                {detail.label}
                            </span>
                            <span className="font-medium">
                                {detail.value}
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );

    const renderMessage = (message: Message, index: number) => {
        if (message.type === 'user') {
            return (
                <div key={index} className="flex justify-end mb-4">
                    <div className="bg-blue-500 text-white rounded-lg py-2 px-4 max-w-[70%]">
                        {message.content}
                    </div>
                </div>
            );
        }

        return (
            <div key={index} className="flex flex-col mb-4">
                <div className="bg-gray-100 rounded-lg py-2 px-4 max-w-[70%]">
                    <div className="mb-2">{message.content}</div>

                    {message.plan && renderPlanCard(message.plan, true)}
                    {message.currentPlan && renderPlanCard(message.currentPlan, true)}

                    {message.options && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {message.options.map((option, i) => (
                                <Button
                                    key={i}
                                    variant="outline"
                                    className="text-sm"
                                    onClick={() => {
                                        setInputValue(option);
                                        handleSubmit(new Event('submit') as any);
                                    }}
                                >
                                    {option}
                                </Button>
                            ))}
                        </div>
                    )}

                    {message.recommendations && (
                        <div className="mt-4 space-y-4">
                            <h3 className="font-bold mb-2">Recommended Plans:</h3>
                            {message.recommendations.map((plan, i) => (
                                <Card key={i} className="p-4">
                                    <h3 className="font-bold mb-2">
                                        {`${i + 1}. ${plan.name}`}
                                    </h3>
                                    <div className="text-sm space-y-1">
                                        {plan.features.map((feature: string, j: number) => (
                                            <div key={j}>{feature}</div>
                                        ))}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}

                    {message.summary && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                            <h3 className="font-bold mb-2">Your Personalized Plan Summary</h3>
                            <div className="text-sm whitespace-pre-wrap">{message.summary}</div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen">
            <div className="p-4 bg-blue-500 text-white">
                <h1 className="text-xl font-bold">Insurance Assistant</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message, index) => renderMessage(message, index))}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask me anything about your plan..."
                        className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                    />
                    <Button type="submit" disabled={loading}>
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default ChatInterface;
