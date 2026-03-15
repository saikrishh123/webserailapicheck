class SerialWeighingScale {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.decoder = new TextDecoder();
        this.buffer = '';
        
        // UI elements
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.testBtn = document.getElementById('testBtn');
        this.testInput = document.getElementById('testInput');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.portInfo = document.getElementById('portInfo');
        this.baudRate = document.getElementById('baudRate');
        this.currentWeight = document.getElementById('currentWeight');
        this.currentUnit = document.getElementById('currentUnit');
        this.lastUpdated = document.getElementById('lastUpdated');
        this.dataLog = document.getElementById('dataLog');
        this.autoScroll = document.getElementById('autoScroll');
        this.parseData = document.getElementById('parseData');
        
        this.initializeEventListeners();
        this.checkWebSerialSupport();
    }

    initializeEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connect());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.clearBtn.addEventListener('click', () => this.clearLog());
        this.testBtn.addEventListener('click', () => this.testDataParsing());
        
        // Allow Enter key in test input
        this.testInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.testDataParsing();
            }
        });
        
        // Handle page unload to cleanup connections
        window.addEventListener('beforeunload', () => this.disconnect());
    }

    checkWebSerialSupport() {
        if (!('serial' in navigator)) {
            this.logError('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
            this.connectBtn.disabled = true;
            this.connectBtn.textContent = 'Web Serial Not Supported';
        } else {
            this.log('✅ Web Serial API is supported');
            this.log('💡 In production, connect real weighing scales via USB/Serial ports');
            this.log('🔧 For testing: Check browser console for serial port detection');
        }
    }

    async connect() {
        try {
            // Request port access
            this.port = await navigator.serial.requestPort();
            
            // Get port info
            const info = this.port.getInfo();
            this.updatePortInfo(info);
            
            // Open the port with selected baud rate
            await this.port.open({ 
                baudRate: parseInt(this.baudRate.value),
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.log('Connected to serial port successfully');
            
            // Start reading data
            this.startReading();
            
        } catch (error) {
            this.logError(`Failed to connect: ${error.message}`);
        }
    }

    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.log('Disconnected from serial port');
            
        } catch (error) {
            this.logError(`Error during disconnect: ${error.message}`);
        }
    }

    async startReading() {
        if (!this.port) return;
        
        try {
            this.reader = this.port.readable.getReader();
            
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    break;
                }
                
                if (value) {
                    this.processIncomingData(value);
                }
            }
        } catch (error) {
            if (error.name !== 'NetworkError') {
                this.logError(`Reading error: ${error.message}`);
            }
        } finally {
            if (this.reader) {
                this.reader.releaseLock();
                this.reader = null;
            }
        }
    }

    processIncomingData(data) {
        // Convert bytes to text and add to buffer
        const text = this.decoder.decode(data, { stream: true });
        this.buffer += text;
        
        // Process complete lines (split by newlines)
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        lines.forEach(line => {
            if (line.trim()) {
                this.processLine(line.trim());
            }
        });
    }

    processLine(line) {
        const timestamp = new Date().toLocaleTimeString();
        
        // Log raw data
        this.logRaw(`${timestamp} | ${line}`);
        
        // Parse weight data if enabled
        if (this.parseData.checked) {
            const weightData = this.parseWeightData(line);
            if (weightData) {
                this.updateCurrentReading(weightData);
                this.logParsed(`Parsed: ${weightData.weight} ${weightData.unit}`);
            }
        }
    }

    parseWeightData(line) {
        // Remove extra whitespace and normalize
        const cleaned = line.replace(/\s+/g, ' ').trim();
        
        // Try different parsing patterns for various scale formats
        const patterns = [
            // Pattern 1: "12.34 kg" or "12.34kg"
            /^([+-]?\d+\.?\d*)\s*(kg|g|lb|lbs|oz|pounds|grams|kilograms)$/i,
            
            // Pattern 2: "ST,+12.34,kg" (stable, weight, unit)
            /^(?:ST|US|OL),([+-]?\d+\.?\d*),(\w+)$/i,
            
            // Pattern 3: "+12.34 kg ST" (weight unit stability)
            /^([+-]?\d+\.?\d*)\s*(\w+)\s*(?:ST|US|OL)$/i,
            
            // Pattern 4: "Weight: 12.34 kg"
            /^(?:weight|wt):\s*([+-]?\d+\.?\d*)\s*(\w+)$/i,
            
            // Pattern 5: Just numbers (assume kg)
            /^([+-]?\d+\.?\d*)$/,
            
            // Pattern 6: CSV format "12.34,kg,ST"
            /^([+-]?\d+\.?\d*),(\w+),?.*$/i
        ];

        for (const pattern of patterns) {
            const match = cleaned.match(pattern);
            if (match) {
                let weight = parseFloat(match[1]);
                let unit = match[2] || 'kg';
                
                // Normalize units
                unit = this.normalizeUnit(unit.toLowerCase());
                
                // Validate weight is a valid number
                if (!isNaN(weight)) {
                    return {
                        weight: weight,
                        unit: unit,
                        raw: line
                    };
                }
            }
        }
        
        return null;
    }

    normalizeUnit(unit) {
        const unitMap = {
            'g': 'g',
            'gram': 'g',
            'grams': 'g',
            'kg': 'kg', 
            'kilogram': 'kg',
            'kilograms': 'kg',
            'lb': 'lb',
            'lbs': 'lb',
            'pound': 'lb',
            'pounds': 'lb',
            'oz': 'oz',
            'ounce': 'oz',
            'ounces': 'oz'
        };
        
        return unitMap[unit] || unit;
    }

    updateCurrentReading(weightData) {
        this.currentWeight.textContent = weightData.weight.toFixed(2);
        this.currentUnit.textContent = weightData.unit;
        this.lastUpdated.textContent = new Date().toLocaleTimeString();
        
        // Add visual feedback for new reading
        this.currentWeight.style.transform = 'scale(1.1)';
        setTimeout(() => {
            this.currentWeight.style.transform = 'scale(1)';
        }, 200);
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        this.dataLog.appendChild(logEntry);
        this.scrollToBottom();
    }

    logRaw(message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'raw-data-line';
        logEntry.textContent = message;
        this.dataLog.appendChild(logEntry);
        this.scrollToBottom();
    }

    logParsed(message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'parsed-weight';
        logEntry.innerHTML = `<span class="timestamp">[${new Date().toLocaleTimeString()}]</span> ${message}`;
        this.dataLog.appendChild(logEntry);
        this.scrollToBottom();
    }

    logError(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'error';
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ERROR: ${message}`;
        this.dataLog.appendChild(logEntry);
        this.scrollToBottom();
        console.error(message);
    }

    scrollToBottom() {
        if (this.autoScroll.checked) {
            this.dataLog.scrollTop = this.dataLog.scrollHeight;
        }
    }

    clearLog() {
        this.dataLog.innerHTML = '';
        this.log('Log cleared');
    }

    testDataParsing() {
        const testData = this.testInput.value.trim();
        if (!testData) {
            this.logError('Enter test data in the input field (e.g., "50.25 kg" or "ST,45.3,kg")');
            return;
        }

        this.log(`🧪 Testing data parsing with: "${testData}"`);
        this.processLine(testData);
        this.testInput.value = ''; // Clear input after test
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add transition effects to weight display
    const weightValue = document.getElementById('currentWeight');
    if (weightValue) {
        weightValue.style.transition = 'all 0.2s ease-in-out';
    }
    
    // Initialize the serial weighing scale app
    window.serialScale = new SerialWeighingScale();
    
    // Log welcome message
    window.serialScale.log('Serial Weighing Scale Reader initialized');
    window.serialScale.log('Click "Connect to Serial Port" to get started');
    
    // Check for HTTPS in production
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        window.serialScale.logError('HTTPS is required for Web Serial API in production. Please use HTTPS.');
    }
});