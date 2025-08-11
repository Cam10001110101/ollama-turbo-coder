const { Ollama } = require('ollama');

async function testOllamaAPI() {
    const apiKey = process.env.OLLAMA_API_KEY || 'eefaf42354494ecfa8cdc860553cb259.u3Wsgs0PBboRpnTvdaVfYdod';
    
    console.log('Testing Ollama API with key:', apiKey.substring(0, 8) + '...');
    
    const ollama = new Ollama({
        host: 'https://ollama.com',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
    
    try {
        console.log('Attempting to chat with gpt-oss:120b...');
        const response = await ollama.chat({
            model: 'gpt-oss:120b',
            messages: [{ role: 'user', content: 'Say hello' }],
            stream: false
        });
        
        console.log('Success! Response:', response.message.content);
    } catch (error) {
        console.error('Error:', error.message);
        if (error.status_code) {
            console.error('Status code:', error.status_code);
        }
    }
}

testOllamaAPI();