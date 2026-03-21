document.addEventListener('DOMContentLoaded', () => {
    const equationContainer = document.getElementById('equation-container');
    const svgLayer = document.getElementById('arcs-svg');
    const inputOverlay = document.getElementById('keypad-overlay');
    const submitBtn = document.getElementById('keypad-submit');

    let config = [];
    let equationParts = []; // Stores objects { value: number/string, type: 'number'|'operator'|'equals'|'result' }
    let currentStep = 0; // The index of the operator we are currently solving (0 is the first operation)
    let currentResult = 0; // Tracks the result as we go left to right
    let steps = []; // Stores indices of numbers involved in each step

    // Keypad State
    let currentInputStr = "";
    const nextStepDelay = 1500; // 1.5 seconds delay between steps

    // Timer State
    let startTime = 0;
    let stepStartTime = 0;
    let timerInterval = null;
    const timerEl = document.getElementById('timer-display');

    // Score State
    let currentScore = 5.0;
    const starContainer = document.getElementById('star-container');

    // Name State
    let playerName = localStorage.getItem('player_name') || '';
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
        nameInput.value = playerName;
        nameInput.addEventListener('input', (e) => {
            playerName = e.target.value.trim();
            localStorage.setItem('player_name', playerName);
            updateCharacterBubbles();
        });
    }

    function updateCharacterBubbles() {
        const sheriffBubble = document.querySelector('#sheriff-container .character-bubble');
        const deputyBubble = document.querySelector('#deputy-container .character-bubble');
        const suffix = playerName ? `, ${playerName}!` : '!';
        if (sheriffBubble) sheriffBubble.textContent = `Great Job${suffix}`;
        if (deputyBubble) deputyBubble.textContent = `Well Done${suffix}`;
    }

    // Call it once early
    updateCharacterBubbles();

    function updateStarDisplay() {
        starContainer.innerHTML = '';
        // 5 stars total
        // logic:
        // 5.0 -> 5 full
        // 4.5 -> 4 full, 1 half
        // 4.0 -> 4 full, 1 lost
        // etc.

        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.textContent = '★'; // Unicode star

            if (currentScore >= i) {
                // Full star
                // default style is gold
            } else if (currentScore >= i - 0.5) {
                // Half star
                star.classList.add('half');
            } else {
                // Lost star
                star.classList.add('lost');
            }
            starContainer.appendChild(star);
        }
    }

    function applyPenalty() {
        if (currentScore > 0) {
            currentScore -= 0.5;
            if (currentScore < 0) currentScore = 0;
            updateStarDisplay();
        }
    }

    // Initialize
    initGame();

    async function initGame() {
        await loadConfig();
        generateEquation();
        setupKeypad();

        // Reset Score
        currentScore = 5.0;
        updateStarDisplay();

        startTimer();

        // Wait for fonts to load
        document.fonts.ready.then(() => {
            calculateSteps();
            activateStep(0);
        });
    }

    function startTimer() {
        startTime = Date.now();
        stepStartTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            timerEl.textContent = formatTime(elapsed);
        }, 1000);
    }

    function getStepDuration() {
        const now = Date.now();
        const durationSeconds = Math.floor((now - stepStartTime) / 1000);
        stepStartTime = now; // reset for next step
        return formatTime(durationSeconds);
    }

    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // Default config for reset
    const DEFAULT_CONFIG = [
        { min: 7, max: 20, sign: "+" },
        { min: 7, max: 20, sign: "-" },
        { min: 7, max: 20, sign: "=" }
    ];

    async function loadConfig() {
        // First check localStorage
        const savedConfig = localStorage.getItem('masha_math_config');
        if (savedConfig) {
            try {
                config = JSON.parse(savedConfig);
                console.log("Config loaded from localStorage:", config);
                return;
            } catch (e) {
                console.error("Error parsing saved config:", e);
            }
        }

        // If no localStorage config, try fetching from config.txt
        try {
            const response = await fetch('config.txt');
            const text = await response.text();
            const lines = text.trim().split('\n');
            config = lines.map(line => {
                const [min, max, sign] = line.split(';');
                return {
                    min: parseInt(min),
                    max: parseInt(max),
                    sign: sign.trim()
                };
            });
            // Save to localStorage for future use
            localStorage.setItem('masha_math_config', JSON.stringify(config));
            console.log("Config loaded from file and saved to localStorage:", config);
        } catch (e) {
            console.error("Error loading config:", e);
            // Fallback to default
            config = [...DEFAULT_CONFIG];
            localStorage.setItem('masha_math_config', JSON.stringify(config));
        }
    }

    function generateEquation() {
        equationParts = [];
        currentResult = 0;

        // Dynamic equation generation based on config length
        // Each config row defines: min, max for a number and an operator
        // The last row should have "=" as operator

        for (let i = 0; i < config.length; i++) {
            const row = config[i];
            const prevSign = i > 0 ? config[i - 1].sign : null;

            // Generate number with constraints
            let maxVal = row.max;
            let minVal = row.min;

            // For subtraction, ensure result doesn't go negative
            if (prevSign === '-') {
                maxVal = Math.min(row.max, currentResult);
                minVal = Math.min(row.min, maxVal);
            }

            const num = getRandomInt(minVal, maxVal);
            equationParts.push({ value: num, type: 'number', el: null });

            // Calculate running result
            if (i === 0) {
                currentResult = num;
            } else {
                switch (prevSign) {
                    case '+': currentResult += num; break;
                    case '-': currentResult -= num; break;
                    case '*': currentResult *= num; break;
                    case '/': currentResult = Math.floor(currentResult / num); break;
                }
            }

            // Add operator (except for last row which uses "=")
            if (row.sign === '=') {
                equationParts.push({ value: '=', type: 'equals', el: null });
                equationParts.push({ value: '?', type: 'question-mark', el: null });
            } else {
                equationParts.push({ value: row.sign, type: 'operator', el: null });
            }
        }
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // renderEquation logic is now handled dynamically by renderTopEquation

    function calculateSteps() {
        steps = [];
        let runningRes = equationParts[0].value;

        // Loop through all operations (config.length - 1 operations)
        for (let i = 0; i < config.length - 1; i++) {
            const opIdx = i * 2 + 1;
            const nextNumIdx = i * 2 + 2;
            const op = equationParts[opIdx].value;
            const nextNum = equationParts[nextNumIdx].value;

            switch (op) {
                case '+': runningRes += nextNum; break;
                case '-': runningRes -= nextNum; break;
                case '*': runningRes *= nextNum; break;
                case '/': runningRes = Math.floor(runningRes / nextNum); break;
            }

            steps.push({
                startIdx: i * 2,
                endIdx: (i + 1) * 2,
                result: runningRes,
                wrongCount: 0
            });
        }
    }



    function renderTopEquation() {
        equationContainer.innerHTML = '';
        
        let partsToShow = [];
        if (currentStep === 0) {
            partsToShow = [...equationParts];
        } else if (currentStep < steps.length) {
            partsToShow.push({ value: steps[currentStep - 1].result, type: 'number solved' });
            const remainingStartIndex = steps[currentStep].endIdx - 1;
            for(let i=remainingStartIndex; i<equationParts.length; i++) {
                partsToShow.push(equationParts[i]);
            }
        }

        partsToShow.forEach((part, index) => {
            const el = document.createElement('div');
            el.className = `equation-item ${part.type}`;
            el.textContent = part.value;
            
            if (index <= 2 && currentStep < steps.length) {
                el.style.textShadow = '0 0 15px var(--accent-color)';
            } else {
                el.style.opacity = '0.5';
            }

            equationContainer.appendChild(el);
            if (part === equationParts[equationParts.length - 1]) {
                equationParts[equationParts.length - 1].el = el;
            }
        });
    }

    function renderColumnStep(index) {
        const container = document.getElementById('column-step-container');
        const step = steps[index];
        
        let topNumber = index === 0 ? equationParts[step.startIdx].value : steps[index-1].result;
        let bottomNumber = equationParts[step.endIdx].value;
        let operator = equationParts[step.endIdx - 1].value;
        let expectedResultStr = String(step.result);

        const maxLen = Math.max(String(topNumber).length, String(bottomNumber).length, expectedResultStr.length);
        const topStr = String(topNumber).padStart(maxLen, ' ');
        const bottomStr = String(bottomNumber).padStart(maxLen, ' ');

        let html = '<div class="column-math-container">';

        html += '<div class="math-row top-row">';
        for(let char of topStr) {
            html += `<span class="digit-box">${char === ' ' ? '' : char}</span>`;
        }
        html += '</div>';

        html += '<div class="math-row bottom-row">';
        html += `<span class="operator-sign">${operator}</span>`;
        for(let char of bottomStr) {
            html += `<span class="digit-box">${char === ' ' ? '' : char}</span>`;
        }
        html += '</div>';

        html += '<div class="math-row input-row" id="column-input-row">';
        for(let i=0; i<maxLen; i++) {
            html += `<span class="digit-box input-box" data-idx="${i}"></span>`;
        }
        html += '</div>';

        html += '</div>';
        
        container.innerHTML = html;
    }

    function activateStep(index) {
        if (index >= steps.length) {
            finishGame();
            return;
        }
        currentStep = index;
        stepStartTime = Date.now();

        renderTopEquation();
        renderColumnStep(index);

        document.getElementById('column-step-container').classList.remove('hidden');
        inputOverlay.classList.remove('hidden');

        currentInputStr = "";
        updateKeypadUI();
    }

    function finishGame() {
        if (timerInterval) clearInterval(timerInterval);
        inputOverlay.classList.add('hidden');
        document.getElementById('column-step-container').classList.add('hidden');
        
        // Render Final Equation Fully Solved
        equationContainer.innerHTML = '';
        const finalParts = [
            { value: '⭐', type: 'stars' },
            ...equationParts.slice(0, -2),
            { value: '=', type: 'equals' },
            { value: currentResult, type: 'solved' },
            { value: '⭐', type: 'stars' }
        ];
        
        finalParts.forEach((part, index) => {
            const el = document.createElement('div');
            el.className = `equation-item ${part.type}`;
            el.textContent = part.value;
            equationContainer.appendChild(el);
        });



        createConfetti();
        showCharacters();
        saveGameHistory();
    }

    function resetGame() {
        // Clear interval
        if (timerInterval) clearInterval(timerInterval);

        // Hide UI elements
        inputOverlay.classList.add('hidden');
        historyModal.classList.add('hidden');

        // Remove solved results
        document.querySelectorAll('.solved-result').forEach(el => el.remove());

        // Reset characters
        const sheriff = document.getElementById('sheriff-container');
        const deputy = document.getElementById('deputy-container');
        [sheriff, deputy].forEach(char => {
            if (char) {
                char.classList.add('hidden');
                char.classList.remove('celebrate');
            }
        });

        // Re-init
        initGame();
    }

    function showCharacters() {
        const sheriff = document.getElementById('sheriff-container');
        const deputy = document.getElementById('deputy-container');

        updateCharacterBubbles(); // Refresh text in case name changed

        [sheriff, deputy].forEach(char => {
            if (char) {
                char.classList.remove('hidden');
                void char.offsetWidth;
                char.classList.add('celebrate');
            }
        });
    }

    // --- Keypad Logic ---
    function setupKeypad() {
        const delBtn = document.getElementById('keypad-del');
        
        document.querySelectorAll('.keypad-btn').forEach(btn => {
            if(btn.id !== 'keypad-del' && btn.id !== 'keypad-submit') {
                btn.addEventListener('click', () => {
                    if(inputOverlay.classList.contains('locked')) return;
                    const val = btn.getAttribute('data-val');
                    if(val !== null) handleDigitKey(val);
                });
            }
        });

        delBtn.addEventListener('click', handleDelKey);
        submitBtn.addEventListener('click', handleSubmit);
    }

    function handleDigitKey(digit) {
        const expectedLen = String(steps[currentStep].result).length;
        if(currentInputStr.length < expectedLen) {
            currentInputStr = digit + currentInputStr;
            updateKeypadUI();
        }
    }

    function handleDelKey() {
        if(currentInputStr.length > 0) {
            currentInputStr = currentInputStr.substring(1);
            updateKeypadUI();
        }
    }

    function updateKeypadUI() {
        const inputRow = document.getElementById('column-input-row');
        if(!inputRow) return;

        const boxes = inputRow.querySelectorAll('.input-box');
        const expectedLen = String(steps[currentStep].result).length;
        
        boxes.forEach(b => {
            b.textContent = '';
            b.classList.remove('active');
        });

        const maxLen = boxes.length;
        
        for(let i=0; i<currentInputStr.length; i++) {
            const char = currentInputStr[i]; 
            const boxIdx = maxLen - currentInputStr.length + i;
            if(boxes[boxIdx]) {
                boxes[boxIdx].textContent = char;
            }
        }

        if(currentInputStr.length < expectedLen) {
            const activeIdx = maxLen - currentInputStr.length - 1;
            if(boxes[activeIdx]) {
                boxes[activeIdx].classList.add('active');
            }
            submitBtn.disabled = true;
        } else {
            submitBtn.disabled = false;
        }
    }

    const penaltyDelay = 10000;

    function handleSubmit() {
        if (submitBtn.disabled) return;

        const step = steps[currentStep];
        const expectedResultStr = String(step.result);

        if (currentInputStr === expectedResultStr) {
            // Correct
            const duration = getStepDuration();
            step.duration = duration;
            
            inputOverlay.classList.add('hidden');
            
            const boxes = document.querySelectorAll('.input-box');
            boxes.forEach(b => {
                if(b.textContent !== '') {
                    b.style.color = 'var(--success-color)';
                }
            });

            setTimeout(() => {
                document.getElementById('column-step-container').classList.add('hidden');
                activateStep(currentStep + 1);
            }, nextStepDelay);
        } else {
            // WRONG Answer - Penalty
            inputOverlay.animate([
                { transform: 'translateY(0) translateX(0)' },
                { transform: 'translateY(0) translateX(-10px)' },
                { transform: 'translateY(0) translateX(10px)' },
                { transform: 'translateY(0) translateX(0)' }
            ], { duration: 300 });

            submitBtn.disabled = true;
            submitBtn.classList.add('locked');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "⏳";

            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.classList.remove('locked');
                submitBtn.textContent = originalText;
                currentInputStr = ""; // reset on wrong
                updateKeypadUI();
            }, penaltyDelay);

            step.wrongCount = (step.wrongCount || 0) + 1;
            applyPenalty();
        }
    }

    function saveGameHistory() {
        const historyItem = {
            timestamp: new Date().toISOString(),
            totalTime: timerEl.textContent,
            score: currentScore,
            equation: equationParts.slice(0, -1).map(p => p.value).join(''),
            steps: steps.map((s, i) => {
                // Reconstruct the math exp for the step
                // Step 0: Num1 Op1 Num2
                // Step 1: (Result of 0) Op2 Num3
                let exp = "";
                const op = equationParts[s.endIdx - 1].value;
                const num = equationParts[s.endIdx].value;
                if (i === 0) {
                    const n1 = equationParts[s.startIdx].value;
                    exp = `${n1} ${op} ${num}`;
                } else {
                    const prevRes = steps[i - 1].result;
                    exp = `${prevRes} ${op} ${num}`;
                }
                return {
                    expression: exp,
                    result: s.result,
                    time: s.duration,
                    wrongCount: s.wrongCount || 0
                };
            })
        };

        let history = JSON.parse(localStorage.getItem('masha_math_history') || '[]');
        history.push(historyItem);
        localStorage.setItem('masha_math_history', JSON.stringify(history));
        console.log("Game Saved:", historyItem);
    }

    // Removed showSolvedResult as it was specific to arcs

    function createConfetti() {
        // Simple celebration visual
        for (let i = 0; i < 50; i++) {
            const el = document.createElement('div');
            el.style.position = 'fixed';
            el.style.left = '50%';
            el.style.top = '50%';
            el.style.width = '10px';
            el.style.height = '10px';
            el.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
            el.style.borderRadius = '50%';
            el.style.pointerEvents = 'none';
            document.body.appendChild(el);

            const angle = Math.random() * Math.PI * 2;
            const dist = 100 + Math.random() * 200;

            const anim = el.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }
            ], {
                duration: 1000 + Math.random() * 1000,
                easing: 'cubic-bezier(0, .9, .57, 1)',
                fill: 'forwards'
            });

            anim.onfinish = () => el.remove();
        }
    }

    // --- History View Logic ---
    const historyModal = document.getElementById('history-modal');
    const closeHistoryBtn = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');

    let currentSort = { column: 'date', direction: 'desc' };

    // Header click listeners
    document.querySelectorAll('.history-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'desc'; // Default descent
            }
            showHistory();
        });
    });

    const newGameBtn = document.getElementById('new-game-btn');

    newGameBtn.addEventListener('click', () => {
        resetGame();
    });

    timerEl.addEventListener('click', () => {
        showHistory();
    });

    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.add('hidden');
    });

    // Close on click outside
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            historyModal.classList.add('hidden');
        }
    });

    function showHistory() {
        const history = JSON.parse(localStorage.getItem('masha_math_history') || '[]');

        // Sort:
        history.sort((a, b) => {
            let valA, valB;
            switch (currentSort.column) {
                case 'steps':
                    // Sort by totalTime string (HH:MM:SS)
                    valA = a.totalTime || "00:00:00";
                    valB = b.totalTime || "00:00:00";
                    break;
                case 'equation':
                    // Sort by sum of numbers in equation
                    const getSum = (eq) => {
                        const nums = eq.match(/\d+/g);
                        return nums ? nums.reduce((acc, n) => acc + parseInt(n), 0) : 0;
                    };
                    valA = getSum(a.equation);
                    valB = getSum(b.equation);
                    break;
                case 'score':
                    valA = a.score;
                    valB = b.score;
                    break;
                case 'date':
                default:
                    valA = new Date(a.timestamp).getTime();
                    valB = new Date(b.timestamp).getTime();
                    break;
            }

            if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Update header indicators
        document.querySelectorAll('.history-table th').forEach(th => {
            const sortKey = th.getAttribute('data-sort');
            th.textContent = th.textContent.replace(/ [▲▼]/, ''); // Clear
            if (sortKey === currentSort.column) {
                th.textContent += currentSort.direction === 'asc' ? ' ▲' : ' ▼';
            }
        });

        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<tr><td colspan="4" style="text-align:center">No history yet</td></tr>';
        } else {
            history.forEach(item => {
                const tr = document.createElement('tr');

                const date = new Date(item.timestamp);
                const dateStr = date.toLocaleString();

                // Format all steps into a single string
                const stepsList = (item.steps || []).map((s, idx) => {
                    return `<div style="margin-bottom: 4px;">S${idx + 1}: ${s.time} <span style="font-size:0.8em; opacity:0.7">(${s.wrongCount}❌)</span></div>`;
                }).join('');

                // Use details/summary for collapsible view
                let stepsHtml = '';
                if (item.totalTime) {
                    stepsHtml = `
                        <details class="steps-details">
                            <summary>Total: ${item.totalTime}</summary>
                            <div class="steps-list">
                                ${stepsList}
                            </div>
                        </details>
                    `;
                } else {
                    stepsHtml = stepsList;
                }

                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${stepsHtml}</td>
                    <td>${item.equation}</td>
                    <td>${item.score}⭐</td>
                `;
                historyList.appendChild(tr);
            });
        }

        historyModal.classList.remove('hidden');
    }

    // --- Config Editor Logic ---
    const configModal = document.getElementById('config-modal');
    const configList = document.getElementById('config-list');
    const openConfigBtn = document.getElementById('open-config-btn');
    const closeConfigBtn = document.getElementById('close-config');
    const addConfigRowBtn = document.getElementById('add-config-row');
    const saveConfigBtn = document.getElementById('save-config');
    const resetConfigBtn = document.getElementById('reset-config');

    let tempConfig = []; // Temporary config for editing

    openConfigBtn.addEventListener('click', () => {
        openConfigEditor();
    });

    closeConfigBtn.addEventListener('click', () => {
        configModal.classList.add('hidden');
    });

    // Close on click outside
    configModal.addEventListener('click', (e) => {
        if (e.target === configModal) {
            configModal.classList.add('hidden');
        }
    });

    addConfigRowBtn.addEventListener('click', () => {
        tempConfig.push({ min: 7, max: 20, sign: '+' });
        renderConfigEditor();
    });

    saveConfigBtn.addEventListener('click', () => {
        // Read values from inputs
        const rows = configList.querySelectorAll('tr');
        const newConfig = [];

        rows.forEach(row => {
            const minInput = row.querySelector('.config-min');
            const maxInput = row.querySelector('.config-max');
            const signSelect = row.querySelector('.config-sign');

            if (minInput && maxInput && signSelect) {
                newConfig.push({
                    min: parseInt(minInput.value) || 1,
                    max: parseInt(maxInput.value) || 20,
                    sign: signSelect.value
                });
            }
        });

        if (newConfig.length >= 3) {
            config = newConfig;
            localStorage.setItem('masha_math_config', JSON.stringify(config));
            configModal.classList.add('hidden');

            // Restart game with new config
            resetGame();
        } else {
            alert('At least 3 rows are required!');
        }
    });

    resetConfigBtn.addEventListener('click', () => {
        if (confirm('Reset to default settings?')) {
            tempConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            renderConfigEditor();
        }
    });

    function openConfigEditor() {
        // Clone current config for editing
        tempConfig = JSON.parse(JSON.stringify(config));
        renderConfigEditor();
        configModal.classList.remove('hidden');
    }

    function renderConfigEditor() {
        configList.innerHTML = '';

        tempConfig.forEach((row, index) => {
            const tr = document.createElement('tr');

            const isLastRow = index === tempConfig.length - 1;

            // Force last row sign to '=' if it's not
            if (isLastRow) {
                row.sign = '=';
            } else if (row.sign === '=') {
                // If it's NOT the last row but has '=', default it to '+' so user can change it
                row.sign = '+';
            }

            const operators = isLastRow ? ['='] : ['+', '-', '*', '/'];

            const optionsHtml = operators.map(op =>
                `<option value="${op}" ${row.sign === op ? 'selected' : ''}>${op}</option>`
            ).join('');

            tr.innerHTML = `
                <td>
                    <input type="number" class="config-input config-min" value="${row.min}" min="1" max="99">
                </td>
                <td>
                    <input type="number" class="config-input config-max" value="${row.max}" min="1" max="99">
                </td>
                <td>
                    <select class="config-select config-sign" ${isLastRow ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>
                </td>
                <td>
                    <button class="remove-row-btn" data-index="${index}" ${tempConfig.length <= 3 ? 'disabled' : ''}>×</button>
                </td>
            `;

            // Add change listeners to update tempConfig
            const minInput = tr.querySelector('.config-min');
            const maxInput = tr.querySelector('.config-max');
            const signSelect = tr.querySelector('.config-sign');

            minInput.addEventListener('change', () => {
                tempConfig[index].min = parseInt(minInput.value) || 1;
            });

            maxInput.addEventListener('change', () => {
                tempConfig[index].max = parseInt(maxInput.value) || 20;
            });

            signSelect.addEventListener('change', () => {
                tempConfig[index].sign = signSelect.value;
            });

            // Remove button handler
            const removeBtn = tr.querySelector('.remove-row-btn');
            removeBtn.addEventListener('click', () => {
                if (tempConfig.length > 3) {
                    tempConfig.splice(index, 1);
                    // Ensure last row has '=' sign
                    if (tempConfig.length > 0) {
                        tempConfig[tempConfig.length - 1].sign = '=';
                    }
                    renderConfigEditor();
                }
            });

            configList.appendChild(tr);
        });

        // Update remove button states
        const removeButtons = configList.querySelectorAll('.remove-row-btn');
        removeButtons.forEach(btn => {
            btn.disabled = tempConfig.length <= 3;
        });
    }
});
