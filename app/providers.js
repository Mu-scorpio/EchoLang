(function () {
  const providers = [
    {
      id: 'opencode', name: 'OpenCode Zen', detail: 'OpenAI-compatible gateway',
      baseUrl: 'https://opencode.ai/zen/v1', defaultModel: '',
      models: [],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://opencode.ai/zen'
    },
    {
      id: 'openrouter', name: 'OpenRouter', detail: 'Multi-model gateway',
      baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini',
      models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://openrouter.ai/docs/quickstart'
    },
    {
      id: 'anthropic', name: 'Anthropic', detail: 'Claude Messages API',
      baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5',
      models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
      requestStyle: 'anthropic', endpoint: '/messages', docs: 'https://docs.anthropic.com/en/api/messages'
    },
    {
      id: 'googlegemini', name: 'Google Gemini', detail: 'Gemini OpenAI compatibility',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
      requestStyle: 'gemini', endpoint: '/chat/completions', docs: 'https://ai.google.dev/gemini-api/docs/openai'
    },
    {
      id: 'deepseek', name: 'DeepSeek', detail: 'DeepSeek API',
      baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash',
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://api-docs.deepseek.com/api/deepseek-api'
    },
    {
      id: 'mistralai', name: 'Mistral AI', detail: 'Mistral Chat Completions',
      baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest',
      models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://docs.mistral.ai/api'
    },
    {
      id: 'perplexity', name: 'Perplexity', detail: 'Sonar API',
      baseUrl: 'https://api.perplexity.ai', defaultModel: 'sonar',
      models: ['sonar', 'sonar-pro', 'sonar-reasoning-pro'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://docs.perplexity.ai/api-reference/chat-completions'
    },
    {
      id: 'huggingface', name: 'Hugging Face', detail: 'Inference Providers',
      baseUrl: 'https://router.huggingface.co/v1', defaultModel: 'deepseek-ai/DeepSeek-V4-Pro:fastest',
      models: ['deepseek-ai/DeepSeek-V4-Pro:fastest', 'Qwen/Qwen3.5-397B-A17B:fastest', 'openai/gpt-oss-120b:fastest'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://huggingface.co/docs/inference-providers'
    },
    {
      id: 'alibabacloud', name: 'Alibaba Cloud', detail: 'Model Studio / DashScope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-flash',
      models: ['qwen-flash', 'qwen-plus', 'qwen-max'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://help.aliyun.com/en/model-studio/first-api-call-to-qwen'
    },
    {
      id: 'qwen', name: 'Qwen', detail: '通义千问 OpenAI 兼容接口',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-flash',
      models: ['qwen-flash', 'qwen-plus', 'qwen-max'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://help.aliyun.com/en/model-studio/first-api-call-to-qwen'
    },
    {
      id: 'moonshotai', name: 'Moonshot AI', detail: 'Kimi API',
      baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.5',
      models: ['kimi-k2.5', 'kimi-k2-thinking', 'moonshot-v1-128k'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://platform.moonshot.cn/docs'
    },
    {
      id: 'baidu', name: 'Baidu ERNIE', detail: '千帆 V2 Chat Completions',
      baseUrl: 'https://qianfan.baidubce.com/v2', defaultModel: 'ernie-4.5-turbo-128k',
      models: ['ernie-4.5-turbo-128k', 'ernie-4.5-turbo-32k', 'deepseek-v4-flash'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb'
    },
    {
      id: 'minimax', name: 'MiniMax', detail: 'MiniMax OpenAI-compatible API',
      baseUrl: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.7',
      models: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://platform.minimaxi.com/docs/guides/text-generation'
    },
    {
      id: 'xiaomi', name: 'Xiaomi MiMo', detail: 'MiMo OpenAI-compatible API',
      baseUrl: 'https://api.xiaomimimo.com/v1', defaultModel: 'mimo-v2.5-pro',
      models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://mimo.mi.com/docs/en-US/quick-start/summary/first-api-call'
    },
    {
      id: 'meta', name: 'Meta Llama API', detail: 'Llama API compatibility',
      baseUrl: 'https://api.llama.com/compat/v1', defaultModel: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
      models: ['Llama-4-Maverick-17B-128E-Instruct-FP8', 'Llama-4-Scout-17B-16E-Instruct-FP8'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://llama.developer.meta.com/'
    },
    {
      id: 'x', name: 'xAI', detail: 'Grok Chat Completions',
      baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-4.5',
      models: ['grok-4.5', 'grok-4.1-fast', 'grok-3-mini'],
      requestStyle: 'openai', endpoint: '/chat/completions', docs: 'https://docs.x.ai/developers/rest-api-reference/inference/chat'
    },
    {
      id: 'replicate', name: 'Replicate', detail: 'Prediction API · 需适配',
      baseUrl: 'https://api.replicate.com/v1', defaultModel: '', models: [],
      requestStyle: 'unsupported', endpoint: '/predictions', docs: 'https://replicate.com/docs/reference/http'
    },
    {
      id: 'databricks', name: 'Databricks', detail: 'Workspace serving endpoints',
      baseUrl: '', defaultModel: '', models: [], requestStyle: 'unsupported', endpoint: '/serving-endpoints',
      docs: 'https://docs.databricks.com/aws/en/machine-learning/foundation-models/api-reference'
    },
    {
      id: 'cursor', name: 'Cursor', detail: '无公开通用模型 API',
      baseUrl: '', defaultModel: '', models: [], requestStyle: 'unsupported', endpoint: '', docs: 'https://docs.cursor.com/'
    },
    {
      id: 'windsurf', name: 'Windsurf', detail: '无公开通用模型 API',
      baseUrl: '', defaultModel: '', models: [], requestStyle: 'unsupported', endpoint: '', docs: 'https://docs.windsurf.com/'
    }
  ];

  window.EchoLangProviderCatalog = providers;
  window.ZiProviderCatalog = providers;
})();
