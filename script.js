document.addEventListener('DOMContentLoaded', () => {
    const equationContainer = document.getElementById('equation-container');
    const svgLayer = document.getElementById('arcs-svg');
    const inputOverlay = document.getElementById('input-overlay');
    const rollerList = document.getElementById('roller-list');
    const submitBtn = document.getElementById('submit-btn');

    let config = [];
    let equationParts = []; // Stores objects { value: number/string, type: 'number'|'operator'|'equals'|'result' }
    let currentStep = 0; // The index of the operator we are currently solving (0 is the first operation)
    let currentResult = 0; // Tracks the result as we go left to right
    let steps = []; // Stores indices of numbers involved in each step

    // Roller State
    let currentRollerValue = 0;
    let isDragging = false;
    let startY = 0;
    let currentTranslateY = 0;
    const itemHeight = 40;
    const minRollerRange = 0;
    const maxRollerRange = 100;
    const nextStepDelay = 10000; // 10 seconds delay between steps

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
        renderEquation();
        setupRoller();

        // Reset Score
        currentScore = 5.0;
        updateStarDisplay();

        startTimer();

        // Wait for fonts to load to ensure correct positioning
        document.fonts.ready.then(() => {
            calculateSteps();
            drawArcs();
            activateStep(0);
        });

        // Handle Resize
        window.addEventListener('resize', () => {
            drawArcs();
            if (currentStep < steps.length) {
                positionOverlay(currentStep); // Re-position overlay if active
            }
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

    function renderEquation() {
        equationContainer.innerHTML = '';
        equationParts.forEach((part, index) => {
            const el = document.createElement('div');
            el.className = `equation-item ${part.type}`;
            el.textContent = part.value;
            equationContainer.appendChild(el);
            part.el = el;

            // Add ID for better tracking if needed
            el.dataset.index = index;
        });
    }

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



    function drawArcs() {
        svgLayer.innerHTML = ''; // Clear previous
        steps.forEach((step, index) => {
            const startEl = equationParts[step.startIdx].el;
            const endEl = equationParts[step.endIdx].el;

            const startRect = startEl.getBoundingClientRect();
            const endRect = endEl.getBoundingClientRect();

            // Calculate center points relative to container
            // We need coords relative to the SVG which is absolute 0,0
            const x1 = startRect.left + startRect.width / 2;
            const x2 = endRect.left + endRect.width / 2;
            const y = startRect.top; // Arcs go above

            // Create Path
            // Move to x1,y. Curve up and over to x2,y.
            // Control points higher up.
            const dist = Math.abs(x2 - x1);
            const height = dist * 0.4; // Height proportional to width

            const pathData = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - height} ${x2} ${y}`;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", pathData);
            path.setAttribute("class", "game-arc");
            path.id = `arc-${index}`;
            svgLayer.appendChild(path);
        });
    }

    function positionOverlay(stepIndex) {
        if (inputOverlay.classList.contains('hidden')) return;

        const arc = document.getElementById(`arc-${stepIndex}`);
        if (!arc) return;

        const totalLength = arc.getTotalLength();
        const midPoint = arc.getPointAtLength(totalLength / 2);

        inputOverlay.style.left = `${midPoint.x}px`;
        inputOverlay.style.top = `${midPoint.y - 15}px`; // Increased spacing slightly
    }

    function activateStep(index) {
        if (index >= steps.length) {
            finishGame();
            return;
        }
        currentStep = index;

        // Start tracking time for this step
        stepStartTime = Date.now();

        // Highlight Arc
        const arc = document.getElementById(`arc-${index}`);
        arc.classList.add('active');

        inputOverlay.classList.remove('hidden');
        positionOverlay(index);

        resetRoller();
    }

    function finishGame() {
        inputOverlay.classList.add('hidden');
        const qMark = equationParts[equationParts.length - 1].el;
        qMark.textContent = currentResult + ""; // Ensure string
        qMark.classList.remove('question-mark');
        qMark.classList.add('solved');

        qMark.classList.add('solved');

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

    // --- Roller Logic ---
    function setupRoller() {
        // Populate
        for (let i = minRollerRange; i <= maxRollerRange; i++) {
            const li = document.createElement('li');
            li.ClassName = 'roller-item';
            li.textContent = i;
            li.classList.add('roller-item');
            rollerList.appendChild(li);
        }

        // Events
        rollerList.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);

        // Touch events
        rollerList.addEventListener('touchstart', (e) => startDrag(e.touches[0]));
        document.addEventListener('touchmove', (e) => onDrag(e.touches[0]));
        document.addEventListener('touchend', endDrag);

        // Wheel
        rollerList.addEventListener('wheel', (e) => {
            currentTranslateY -= e.deltaY;
            clampScroll();
            updateRollerVisuals();
        });
    }

    function startDrag(e) {
        isDragging = true;
        startY = e.clientY;
    }

    function onDrag(e) {
        if (!isDragging) return;
        const delta = e.clientY - startY;
        currentTranslateY += delta;
        startY = e.clientY;
        clampScroll();
        updateRollerVisuals();
    }

    function endDrag() {
        isDragging = false;
        snapToGrid();
    }

    function clampScroll() {
        const totalItems = rollerList.children.length; // Includes padding
        if (totalItems === 0) return;

        // Items: Pad, Val1, Val2 ..., Pad
        // Max Scroll (Top): 0 (Pad at top, Val1 selected) or maybe slightly positive for bounce
        // Min Scroll (Bottom): -((totalItems - 1) * itemHeight)? 
        // Let's allow loose scrolling and let snap handle limits, but apply the transform here.

        // Just apply global transform variable to element
        rollerList.style.transform = `translateY(${currentTranslateY}px)`;
    }

    function snapToGrid() {
        // Round to nearest itemHeight
        let index = Math.round(currentTranslateY / itemHeight);

        currentTranslateY = index * itemHeight;

        // Hard Clamp to valid range
        // Valid indices:
        // Index 0 corresponds to first real item (due to padding) being selected?
        // Let's check resetRoller puts us at 0.
        // In resetRoller: translateY = 0.
        // If translateY 0 -> Value should be 0? 
        // Our loop starts at minRollerRange (-50).
        // So item[1] (first real item) is -50.
        // If translate is 0, we see Item[1] in window.
        // So Value = minRollerRange.

        // We need to shift:
        // currentRollerValue = minRollerRange - index (because scrolling UP goes negative index?)
        // Let's re-verify direction.
        // Drag Up (negative delta) -> translateY decreases (negative). 
        // Content moves Up. Lower items appear. Value increases.
        // So: more negative index = higher value.
        // Value = minRollerRange + (-index).

        // Correct.

        // Clamp index
        const totalItems = maxRollerRange - minRollerRange + 1;
        // Max value is maxRollerRange.
        // Min value is minRollerRange.

        // if Value > max: Value = max. -> -index > max - min -> -index > diff. -> index < -diff.
        // if Value < min: Value = min. -> -index < 0. -> index > 0.

        const maxVal = maxRollerRange;
        const minVal = minRollerRange;

        let calculatedVal = minVal - index;

        if (calculatedVal > maxVal) {
            calculatedVal = maxVal;
            index = -(maxVal - minVal);
        }
        if (calculatedVal < minVal) {
            calculatedVal = minVal;
            index = 0;
        }

        currentTranslateY = index * itemHeight;
        rollerList.style.transform = `translateY(${currentTranslateY}px)`;

        currentRollerValue = calculatedVal;
        updateRollerVisuals();
    }

    function updateRollerVisuals() {
        const index = Math.round(currentTranslateY / itemHeight);
        // index 0 -> Value minRollerRange (-50).
        // The list has padding at child[0].
        // The real item for -50 is child[1].
        // The real item for -49 is child[2].
        // General: child[1 + (value - min)].
        // Or based on index:
        // value = min - index.
        // childIdx = 1 + (min - index - min) = 1 - index.

        const items = rollerList.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }

        const activeIdx = 1 - index;
        if (items[activeIdx]) {
            items[activeIdx].classList.add('active');
        }
    }

    function resetRoller() {
        // We need padding for the roller to work nicely (empty top and bottom)
        if (!rollerList.hasPadding) {
            const padTop = document.createElement('li');
            padTop.className = 'roller-item';
            rollerList.prepend(padTop);

            const padBottom = document.createElement('li');
            padBottom.className = 'roller-item';
            rollerList.appendChild(padBottom);
            rollerList.hasPadding = true;
        }

        // Set to 0 (or closest)
        // Value 0.
        // 0 = min - index -> index = min.
        // e.g. min -50. index = -50.
        // translate = -50 * 40 = -2000.

        const targetValue = 0;
        const targetIndex = minRollerRange - targetValue; // e.g. -50 - 0 = -50.

        currentTranslateY = targetIndex * itemHeight;
        rollerList.style.transform = `translateY(${currentTranslateY}px)`;
        currentRollerValue = targetValue;
        updateRollerVisuals();
    }

    const penaltyDelay = 10000; // 10 seconds penalty for wrong answer

    submitBtn.addEventListener('click', () => {
        if (submitBtn.disabled) return;

        const step = steps[currentStep];
        // The value we calculated visually is 'index + 1' from top 0, but since we added padding...
        // Padding top is index 0. Real 0 is index 1.
        // Translate 0: Pad(0), 0(1), 1(2).
        // Highlight is over 0(1). 
        // So index corresponds to value?
        // Translate 0 -> index 0. Visual Middle is Item[1] (Value 0).
        // So currentRollerValue derived from abs(translate/40) is 0. 
        // And that aligns with Item[0+1] which is Value 0. Correct.

        const inputVal = currentRollerValue;

        if (inputVal === step.result) {
            // Correct
            const arc = document.getElementById(`arc-${currentStep}`);
            arc.classList.remove('active');
            arc.classList.add('completed');

            const duration = getStepDuration();
            step.duration = duration; // Store for history
            showSolvedResult(currentStep, inputVal, duration);

            // Hide input immediately
            inputOverlay.classList.add('hidden');

            // Move to next
            setTimeout(() => {
                activateStep(currentStep + 1);
            }, 500);
        } else {
            // WRONG Answer - Penalty
            // Shake feedback
            inputOverlay.animate([
                { transform: 'translate(-50%, -100%) translateX(0)' },
                { transform: 'translate(-50%, -100%) translateX(-10px)' },
                { transform: 'translate(-50%, -100%) translateX(10px)' },
                { transform: 'translate(-50%, -100%) translateX(0)' }
            ], { duration: 300 });

            // Lock interface
            submitBtn.disabled = true;
            submitBtn.classList.add('locked');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "⏳";

            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.classList.remove('locked');
                submitBtn.textContent = originalText;
            }, penaltyDelay);

            // Penalty Logic
            step.wrongCount = (step.wrongCount || 0) + 1;
            applyPenalty();
        }
    });

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

    function showSolvedResult(index, value, timeSpent) {
        const arc = document.getElementById(`arc-${index}`);
        const totalLength = arc.getTotalLength();
        const midPoint = arc.getPointAtLength(totalLength / 2);

        const resultEl = document.createElement('div');
        resultEl.className = 'solved-result';
        // Display time above result
        resultEl.innerHTML = `<div class="step-time-label">${timeSpent}</div>${value}`;

        resultEl.style.left = `${midPoint.x}px`;
        resultEl.style.top = `${midPoint.y - 15}px`;

        document.querySelector('.game-container').appendChild(resultEl);
    }

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

        // Sort: Latest first
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<tr><td colspan="4" style="text-align:center">No history yet</td></tr>';
        } else {
            history.forEach(item => {
                const tr = document.createElement('tr');

                const date = new Date(item.timestamp);
                const dateStr = date.toLocaleString();

                // Format all steps into a single string
                const stepsText = (item.steps || []).map((s, idx) => {
                    return `<div style="margin-bottom: 4px;">S${idx + 1}: ${s.time} <span style="font-size:0.8em; opacity:0.7">(${s.wrongCount}❌)</span></div>`;
                }).join('');

                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${stepsText}</td>
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

            const isLastRow = row.sign === '=' || index === tempConfig.length - 1;
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
                    <select class="config-select config-sign">
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
