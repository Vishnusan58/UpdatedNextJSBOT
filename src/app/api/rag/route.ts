//src/app/api/rag/route.ts
import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Type definitions
interface ChatRequest {
    message: string;
    userId: string;
}

interface RAGResponse {
    type: 'ai_response' | 'error';
    message: string;
    metadata?: {
        context?: string;
        confidence: number;
    };
}

// Configuration
const PINECONE_CONFIG = {
    apiKey: process.env.PINECONE_API_KEY || 'pcsk_2oVkvR_6NYvbzb4mFtNDUWpzo5J2enuXeug8NT9FeFDc1Ys4F6g17jitSrnpv1ytdiaEkT',
    indexName: 'oxford',
    dimension: 1024,
    model: 'multilingual-e5-large'
};

// Initialize Pinecone client
const pinecone = new Pinecone({
    apiKey: PINECONE_CONFIG.apiKey
});

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Store session state
interface SessionState {
    isFirstMessage: boolean;
}

const sessions: Map<string, SessionState> = new Map();

// Function to generate embeddings
async function generateEmbeddings(text: string): Promise<number[]> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hash = Array.from(data).reduce((acc, byte) => (acc + byte) % PINECONE_CONFIG.dimension, 0);

        return Array(PINECONE_CONFIG.dimension).fill(0).map((_, i) => {
            const angle = (i + hash) * (Math.PI / (PINECONE_CONFIG.dimension / 2));
            return Math.sin(angle) * 0.5 + Math.cos(angle * 2) * 0.5;
        });
    } catch (error) {
        console.error('Error generating embeddings:', error);
        return Array(PINECONE_CONFIG.dimension).fill(0).map((_, i) =>
            Math.sin(i * (Math.PI / (PINECONE_CONFIG.dimension / 2)))
        );
    }
}

// RAG system implementation
async function queryRAGSystem(query: string): Promise<RAGResponse> {
    try {
        if (!query.trim()) {
            throw new Error("Query cannot be empty");
        }

        // Get index
        const index = pinecone.index(PINECONE_CONFIG.indexName);
        console.log('Using index:', PINECONE_CONFIG.indexName);

        // Generate embeddings for the query
        const queryEmbedding = await generateEmbeddings(query);

        try {
            const queryResponse = await index.query({
                vector: queryEmbedding,
                topK: 3,
                includeMetadata: true
            });

            const contexts = queryResponse.matches
                .map(match => match.metadata?.text || "")
                .filter(text => text.length > 0);

            const combinedContext = contexts.join('\n\n');

            const prompt = `
Use the following context to answer the question. Be concise and specific.

CONTEXT ABOUT THE INSURANCE PLAN:
${combinedContext}

USER QUESTION:
${query}

INSTRUCTIONS:

1.if the context is not present in documents. say "We don't have specific information about that aspect of UnitedHealthcare Oxford coverage"
3. Be clear, concise, and professional and provide answer in less than 100 words
if this question asked 
Question: My wife is currently pregnant. Will this plan cover her existing pregnancy?


Answer: Yes, but childbirth/delivery professional services are no charge, while facility services have a $200 copay per day up to $400 per admission.  Maternity care tests and services may be covered elsewhere in the SBC.





Your response:`;

            const result = await model.generateContent(prompt);
            const response = result.response?.text() || "";

            const confidence = queryResponse.matches.length > 0
                ? Math.min(Math.max(queryResponse.matches[0]?.score || 0, 0), 1)
                : 0;

            return {
                type: 'ai_response',
                message: response,
                metadata: {
                    context: combinedContext,
                    confidence: confidence
                }
            };

        } catch (error) {
            console.error('Pinecone query error:', error);
            throw new Error(`Failed to query vector database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

    } catch (error) {
        console.error('RAG Query Error:', error);
        return {
            type: 'error',
            message: error instanceof Error ? error.message : 'An unexpected error occurred',
            metadata: {
                confidence: 0
            }
        };
    }
}
// 2. If the context doesn't contain enough information, say "I don't have specific information about that aspect of UnitedHealthcare Oxford coverage"
// 4. Focus on factual information about the plan details
// 5. If discussing costs or coverage, be specific with numbers and percentages
// API route handler
export async function POST(req: Request) {
    try {
        const { message, userId }: ChatRequest = await req.json();

        // Validate request
        if (!message?.trim() || !userId?.trim()) {
            return NextResponse.json({
                type: 'error',
                message: 'Message and userId are required',
                metadata: { confidence: 0 }
            }, { status: 400 });
        }

        // Check if this is the first message for this userId
        if (!sessions.has(userId)) {
            // Set session state for future messages
            sessions.set(userId, { isFirstMessage: false });

            // Return welcome message for first interaction
            return NextResponse.json({
                type: 'ai_response',
                message: "Hello! I'm your AI insurance assistant specializing in UnitedHealthcare Oxford coverage. How can I help you today?",
                metadata: {
                    context: '',
                    confidence: 1
                }
            });
        }

        // Process query with RAG system
        const ragResponse = await queryRAGSystem(message);

        return NextResponse.json(ragResponse);

    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json({
            type: 'error',
            message: 'We apologize, but we encountered an issue processing your request. Please try again.',
            metadata: { confidence: 0 }
        }, { status: 500 });
    }
}

// Add a GET endpoint for testing Pinecone connection
export async function GET() {
    try {
        const indexes = await pinecone.listIndexes();
        return NextResponse.json({
            status: 'ok',
            indexes: indexes
        });
    } catch (error) {
        return NextResponse.json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
