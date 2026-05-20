// lib/webocr.js
class WebOCR {
    constructor() {
        // ⚠️ 修改：使用 chrome.runtime.getURL 替代 GM_getResourceURL
        this.MODEL_URL = chrome.runtime.getURL('models/common_q8.onnx');
        
        // 🔧 配置 ONNX Runtime WASM 路径
        // 使用 CDN 提供完整的 WASM 文件集（包括 .wasm 和 .mjs 文件）
        ort.env.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;
        
        console.log('ONNX Runtime WASM 配置:', {
            wasmPaths: ort.env.wasm.wasmPaths,
            numThreads: ort.env.wasm.numThreads,
            simd: ort.env.wasm.simd
        });
        
        // 完整的字符集（从第 31-95 行复制）
        this.CHARSET = {
            '13': '6',
            '55': 'f',
            '209': 'p',
            '210': 'L',
            '297': 'Y',
            '306': 'w',
            '309': '3',
            '311': 'F',
            '320': 'm',
            '521': 'X',
            '598': 'G',
            '689': 'x',
            '782': 'i',
            '897': 'T',
            '901': 'N',
            '1072': 'v',
            '1150': 'c',
            '1204': 'B',
            '1503': 'n',
            '1849': 'Q',
            '1965': 'H',
            '2113': 'K',
            '2185': 'W',
            '2341': 'P',
            '2376': 'r',
            '2457': 'l',
            '2547': 'E',
            '2621': 'Z',
            '2714': 's',
            '2851': '2',
            '3073': 'z',
            '3128': 'D',
            '3157': 'O',
            '3606': '4',
            '4018': '1',
            '4102': 't',
            '4393': 'b',
            '4429': 'o',
            '4588': 'u',
            '4725': '9',
            '4730': 'j',
            '4733': '0',
            '4919': '8',
            '5223': '5',
            '5428': 'e',
            '5461': 'A',
            '5629': 'R',
            '5690': 'g',
            '5737': 'k',
            '5855': 'S',
            '6554': 'I',
            '6794': '7',
            '6810': 'd',
            '6887': 'V',
            '7216': 'J',
            '7266': 'a',
            '7412': 'h',
            '7576': 'q',
            '7712': 'U',
            '7844': 'M',
            '7877': 'y',
            '7961': 'C',
            '1151': 'c'
        };
        
        this.session = null;
        this.isLoadingModel = false;
    }

    async loadModel() {
        if (this.session || this.isLoadingModel) return;
        this.isLoadingModel = true;

        try {
            console.log('开始加载模型:', this.MODEL_URL);
            console.log('WASM 配置:', {
                wasmPaths: ort.env.wasm.wasmPaths,
                numThreads: ort.env.wasm.numThreads,
                simd: ort.env.wasm.simd
            });
            
            this.session = await ort.InferenceSession.create(this.MODEL_URL, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });
            
            console.log('模型加载成功!');
        } catch (e) {
            console.error('Failed to load ONNX model:', e);
            console.error('模型 URL:', this.MODEL_URL);
            console.error('WASM 路径:', ort.env.wasm.wasmPaths);
            throw e;
        } finally {
            this.isLoadingModel = false;
        }
    }

    preprocessImage(imageElement) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const targetHeight = 64;
        const originalWidth = imageElement.naturalWidth;
        const originalHeight = imageElement.naturalHeight;
        const targetWidth = Math.floor(originalWidth * (targetHeight / originalHeight));

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imageData.data;
        const inputData = new Float32Array(targetWidth * targetHeight);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
            inputData[i / 4] = grayscale / 255.0;
        }

        return new ort.Tensor('float32', inputData, [1, 1, 64, targetWidth]);
    }

    decodeOutput(outputTensor, beamWidth = 3) {
        const outputData = outputTensor.data;
        const sequenceLength = outputTensor.dims[0];
        const numClasses = outputTensor.dims[2];

        // 初始化路径列表（[{ text, score, prev }]）
        let paths = [{
            text: '',
            score: 0,
            prev: -1
        }];

        for (let t = 0; t < sequenceLength; t++) {
            const nextPaths = [];

            for (const path of paths) {
                const probs = outputData.slice(t * numClasses, (t + 1) * numClasses);
                const sorted = Array.from(probs)
                    .map((p, i) => ({
                        prob: p,
                        index: i
                    }))
                    .sort((a, b) => b.prob - a.prob)
                    .slice(0, beamWidth);

                for (const {
                        prob,
                        index
                    }
                    of sorted) {
                    const char = this.CHARSET[index] || '';
                    const logProb = Math.log(prob + 1e-12); // 防止 log(0)

                    let newText = path.text;
                    if (index !== 0 && index !== path.prev) {
                        newText += char;
                    }

                    nextPaths.push({
                        text: newText,
                        score: path.score + logProb,
                        prev: index
                    });
                }
            }

            // 保留 top-K 路径（按分数排序）
            paths = nextPaths
                .sort((a, b) => b.score - a.score)
                .slice(0, beamWidth);
        }

        // 返回最高分路径文本
        return paths.length > 0 ? paths[0].text : '';
    }

    async classify(imageElement) {
        if (!this.session && !this.isLoadingModel) {
            await this.loadModel();
        }

        // 等待模型加载完成，最多等待10次，每次500ms
        let attempts = 0;
        const maxAttempts = 10;
        while (!this.session && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }

        if (!this.session) {
            console.warn('Model not loaded after waiting.');
            return "";
        }

        const inputTensor = this.preprocessImage(imageElement);
        const feeds = {
            'input1': inputTensor
        };
        const results = await this.session.run(feeds);
        const outputTensor = Object.values(results)[0];

        const text = this.decodeOutput(outputTensor);
        return text;
    }
}