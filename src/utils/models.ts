export const MODEL_FAMILIES = {
  openai: 'OpenAI',
  azureOpenai: 'Azure OpenAI',
  anthropic: 'Anthropic',
  moonshot: 'Moonshot',
  gemini: 'Gemini',
  groq: 'Groq',
};

export const OPENAI_GPT_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4-32k',
  'gpt-4-turbo-preview',
  'gpt-4o',
];

export const AZURE_OPENAI_GPT_MODELS = [
  'gpt-3.5-turbo',
  'gpt-35-turbo-16k',
  'gpt-35-turbo-instruct',
  'gpt-4',
  'gpt-4-32k',
];

export const OPENAI_EMBEDDING_MODELS = [
  'text-embedding-3-large',
  'text-embedding-3-small',
  'text-embedding-ada-002',
];

export const GEMINI_EMBEDDING_MODELS = ['embedding-001'];

export const ANTHROPIC_MODELS = [
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-2.1',
  'claude-2.0',
  'claude-instant-1.2',
];

export const MOONSHOT_MODELS = [
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
];

export const GEMINI_MODELS = [
  'gemini-1.0-pro',
  'gemini-1.0-pro-vision-latest',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
];

export const GROQ_MODELS = [
  'llama3-8b-8192',
  'llama3-70b-8192',
  'llama2-70b-4096',
  'mixtral-8x7b-32768',
  'gemma-7b-it',
];

export const SYSTEM_TEMPLATE = `Answer the user's question based on the context below.
Present your answer in a structured Markdown format.

If the context doesn't contain any relevant information to the question, don't make something up and just say "I don't know":

<context>
{context}
</context>

<chat_history>
{chatHistory}
</chat_history>

<question>
{question}
</question>

Answer:
`;
