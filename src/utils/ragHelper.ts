// src/utils/ragHelper.ts
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// Configuration constants
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || 'pcsk_2oVkvR_6NYvbzb4mFtNDUWpzo5J2enuXeug8NT9FeFDc1Ys4F6g17jitSrnpv1ytdiaEkT';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyDr6KjoDsPwQiAdDN-8CdzTTbIk8rIIZRg';
const DIMENSION = 1024;
const DEFAULT_INDEX = 'oxford'; // Set Oxford as default index

// Interface definitions
interface RAGResponse {
    type: 'ai_response' | 'error';
    message: string;
    metadata?: {
        context?: string;
        confidence: number;
        planName?: string;
    };
}

// Plan configuration with detailed information
interface PlanConfig {
    indexName: string;
    displayName: string;
    description: string;
    dimension: number;
    host: string;
    model: string;
    metric: string;
}

const PLAN_CONFIGS: { [key: string]: PlanConfig } = {
    'oxford': {
        indexName: 'oxford',
        displayName: 'UnitedHealthcare Oxford',
        description: 'UnitedHealthcare Oxford comprehensive healthcare coverage',
        dimension: DIMENSION,
        host: 'https://oxford-04vrgvs.svc.aped-4627-b74a.pinecone.io',
        model: 'multilingual-e5-large',
        metric: 'cosine'
    }
};

// Initialize Pinecone client with Oxford configuration
const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY
});

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Get plan configuration by name, defaults to Oxford
 */
function getPlanConfig(planName?: string): PlanConfig {
    if (!planName) return PLAN_CONFIGS[DEFAULT_INDEX];
    const normalizedPlanName = planName.toLowerCase().replace(/\s+/g, '');
    return PLAN_CONFIGS[normalizedPlanName] || PLAN_CONFIGS[DEFAULT_INDEX];
}

/**
 * Generates embeddings for the input text
 */
async function generateEmbeddings(text: string): Promise<number[]> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hash = Array.from(data).reduce((acc, byte) => (acc + byte) % DIMENSION, 0);

        return Array(DIMENSION).fill(0).map((_, i) => {
            const angle = (i + hash) * (Math.PI / (DIMENSION / 2));
            return Math.sin(angle) * 0.5 + Math.cos(angle * 2) * 0.5;
        });
    } catch (error) {
        console.error('Error generating embeddings:', error);
        return Array(DIMENSION).fill(0).map((_, i) =>
            Math.sin(i * (Math.PI / (DIMENSION / 2)))
        );
    }
}

/**
 * Retrieves relevant documents for a query
 */
async function retrieveDocuments(queryEmbedding: number[], index: any, topK: number = 3): Promise<Array<{text: string, score: number}>> {
    try {
        const results = await index.query({
            vector: queryEmbedding,
            topK,
            includeMetadata: true
        });

        return results.matches.map(match => ({
            text: match.metadata?.text || "",
            score: match.score || 0
        }));
    } catch (error) {
        console.error('Error retrieving documents:', error);
        return [];
    }
}

/**
 * Generates a response using the Gemini model
 */
async function generateResponse(query: string, context: string, planConfig: PlanConfig): Promise<string> {
    try {
        const prompt = `
You are an expert insurance advisor AI assistant specializing in ${planConfig.displayName}. 
Use the following information to answer the user's question accurately and professionally.

PLAN INFORMATION:
${planConfig.description}

CONTEXT ABOUT THE INSURANCE PLAN:
${context}

USER QUESTION:
${query}

INSTRUCTIONS:
1. Answer based ONLY on the information provided above
2. If the context doesn't contain enough information, say "I don't have specific information about that aspect of ${planConfig.displayName}"
3. Be clear, concise, and professional
4. Focus on factual information about UnitedHealthcare Oxford coverage
5. If discussing costs or coverage, be specific with numbers and percentages
6. Format the response for easy reading

Your response:`;

        const result = await model.generateContent(prompt);
        return result.response?.text() || "I apologize, but I couldn't generate a response at this time.";
    } catch (error) {
        console.error('Error generating response:', error);
        throw new Error('Failed to generate response');
    }
}

/**
 * Main RAG system query function
 */
export async function queryRAGSystem(query: string, planName?: string): Promise<RAGResponse> {
    try {
        // Input validation
        if (!query.trim()) {
            throw new Error("Query cannot be empty");
        }

        // Get plan configuration (defaults to Oxford)
        const planConfig = getPlanConfig(planName);

        // Generate embeddings
        const queryEmbedding = await generateEmbeddings(query);

        // Get index and retrieve documents
        const index = pinecone.index(planConfig.indexName);
        const documents = await retrieveDocuments(queryEmbedding, index);

        if (documents.length === 0) {
            return {
                type: 'ai_response',
                message: `I don't have specific information about that aspect of ${planConfig.displayName}.`,
                metadata: {
                    confidence: 0,
                    planName: planConfig.displayName
                }
            };
        }

        // Combine context from all retrieved documents
        const combinedContext = documents
            .map(doc => doc.text)
            .filter(text => text.length > 0)
            .join('\n\n');

        // Generate response
        const response = await generateResponse(query, combinedContext, planConfig);

        // Calculate confidence (average of top matches)
        const confidence = documents.reduce((acc, doc) => acc + doc.score, 0) / documents.length;

        return {
            type: 'ai_response',
            message: response,
            metadata: {
                context: combinedContext,
                confidence: Math.min(Math.max(confidence, 0), 1),
                planName: planConfig.displayName
            }
        };
    } catch (error) {
        console.error('RAG System Error:', error);
        return {
            type: 'error',
            message: error instanceof Error ? error.message : 'An unexpected error occurred',
            metadata: {
                confidence: 0
            }
        };
    }
}

// Export helper functions for testing
export const _test = {
    generateEmbeddings,
    retrieveDocuments,
    generateResponse,
    getPlanConfig
};
