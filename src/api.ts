import type { ChatRequest, StreamChunk } from './types';

// 智谱可用模型列表
export const AVAILABLE_MODELS = [
  { id: 'glm-4', name: 'GLM-4', description: '最新一代大模型，支持复杂推理' },
  { id: 'glm-4v', name: 'GLM-4V', description: '支持图像理解的多模态模型' },
  { id: 'glm-3-turbo', name: 'GLM-3 Turbo', description: '高性能低成本模型' },
  { id: 'chatglm3-6b', name: 'ChatGLM3-6B', description: '开源可部署模型' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

export class ZhiPuAI {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_API_KEY;
    if (!this.apiKey) {
      throw new Error('API Key 未配置，请在 .env 文件中设置 VITE_API_KEY');
    }
    // 正确地址
    this.baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
  }

  async chatStream(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    onChunk: (chunk: StreamChunk) => void,
    temperature: number = 0.7,
    model: ModelId = 'glm-4',
    abortSignal?: AbortSignal
  ): Promise<void> {
    // 确保 messages 数组中不包含循环引用
    const safeMessages = messages.map(msg => ({
      role: msg.role,
      content: String(msg.content), // 确保 content 是字符串
    }));

    const requestBody: ChatRequest = {
      model,
      messages: safeMessages,
      stream: true,
      temperature,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey.trim()}`, // ✅ 防止空格
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status}\n${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as StreamChunk;
              onChunk(parsed);
            } catch (e) {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    temperature: number = 0.7,
    model: ModelId = 'glm-4'
  ): Promise<any> {
    // 确保 messages 数组中不包含循环引用
    const safeMessages = messages.map(msg => ({
      role: msg.role,
      content: String(msg.content), // 确保 content 是字符串
    }));

    const requestBody: ChatRequest = {
      model,
      messages: safeMessages,
      stream: false,
      temperature,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey.trim()}`, // ✅ 修复
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}\n${text}`);
    }

    return JSON.parse(text);
  }
}

export const zhiPuAI = new ZhiPuAI();