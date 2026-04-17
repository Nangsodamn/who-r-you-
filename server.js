const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are Mini Assistant, a super intelligent AI created by ARI. 
You are helpful, detailed, and precise in your responses.
You can analyze images, answer questions, and provide detailed explanations.
Answer in a friendly but professional manner.`;

app.post('/api/chat', async (req, res) => {
    try {
        const { message, imageUrl } = req.body;
        
        if (!message && !imageUrl) {
            return res.status(400).json({ error: 'Message or image required' });
        }

        console.log(`🤖 Using GPT-4o-mini`);
        if (imageUrl) console.log(`🖼️ With image: ${imageUrl.substring(0, 50)}...`);
        console.log(`📝 Message: ${message ? message.substring(0, 50) + '...' : 'No message'}`);

        let messages = [
            {
                role: "system",
                content: SYSTEM_PROMPT
            }
        ];

        let userContent = [];
        
        if (imageUrl) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: imageUrl
                }
            });
        }

        if (message) {
            userContent.push({
                type: "text",
                text: message
            });
        } else if (imageUrl) {
            userContent.push({
                type: "text",
                text: "Describe this image in detail. What do you see?"
            });
        }

        messages.push({
            role: "user",
            content: userContent
        });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": `http://localhost:${PORT}`,
                "X-Title": "Mini Assistant"
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",  
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7,
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('OpenRouter error:', data.error);
            return res.status(500).json({ error: data.error.message || 'AI service error' });
        }

        const aiResponse = data.choices[0]?.message?.content || "I'm here to help!";

        console.log(`✅ Response received (${aiResponse.length} chars)`);

        res.json({
            success: true,
            response: aiResponse,
            model: "GPT-4o-mini",
            type: imageUrl ? 'image_analysis' : 'text_chat'
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyze-image', async (req, res) => {
    try {
        const { prompt, imageUrl } = req.body;
        
        if (!imageUrl) {
            return res.status(400).json({ error: 'Image URL required' });
        }

        const response = await fetch(`http://localhost:${PORT}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: prompt || "Describe this image in detail",
                imageUrl: imageUrl
            })
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('Image analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        model: "GPT-4o-mini",
        capabilities: "✅ Text + Image Analysis",
        key_status: OPENROUTER_API_KEY ? '✅ Connected' : '❌ No API key'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Mini Messenger with GPT-4o-mini is running',
        model: 'openai/gpt-4o-mini',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'chat.html'));
});

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 MINI MESSENGER WITH GPT-4o-mini');
    console.log('='.repeat(60));
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🤖 Model: openai/gpt-4o-mini`);
    console.log(`🖼️ Capability: ✅ Text + Image Analysis`);
    console.log(`💰 Price: $0.15/1M tokens (₱0.008 per chat)`);
    console.log(`🔑 API Key: ${OPENROUTER_API_KEY ? '✅ Connected' : '❌ Missing'}`);
    console.log('='.repeat(60) + '\n');
    
    if (!OPENROUTER_API_KEY) {
        console.log('⚠️  WARNING: OPENROUTER_API_KEY is not set!');
        console.log('   Get your key at: https://openrouter.ai/keys');
        console.log('   Add to .env file: OPENROUTER_API_KEY=sk-or-v1-xxxxx\n');
    }
});
