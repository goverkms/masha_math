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

    // Timer State
    let startTime = 0;
    let stepStartTime = 0;
    let timerInterval = null;
    const timerEl = document.getElementById('timer-display');

    // Initialize
    initGame();

    async function initGame() {
        await loadConfig();
        generateEquation();
        renderEquation();
        setupRoller();

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

    async function loadConfig() {
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
        } catch (e) {
            console.error("Error loading config:", e);
            // Fallback for testing without server
            config = [
                { min: 7, max: 20, sign: "+" },
                { min: 7, max: 20, sign: "-" },
                { min: 7, max: 20, sign: "=" }
            ];
        }
    }

    function generateEquation() {
        equationParts = [];
        currentResult = 0;

        // 1. First Number (From Row 1 rules)
        // "first number random from 7 to 20"
        const row1 = config[0];
        const num1 = getRandomInt(row1.min, row1.max);
        equationParts.push({ value: num1, type: 'number', el: null });
        currentResult = num1;

        // 2. Loop through operations
        // Row 1 also gives the FIRST sign. 
        // Row 2 gives the SECOND number and SECOND sign.
        // Row 3 gives the THIRD number and "=" sign.

        // Logic interpretation based on prompt:
        // "7;20;+" -> generates first number (7-20) and a "+" sign.
        // "7;20;-" -> generates second number (7-20) and a "-" sign.
        // "7;20;=" -> generates third number (7-20) and a "=" sign.

        // Step 1: Apply Row 1 Sign
        equationParts.push({ value: row1.sign, type: 'operator', el: null });

        // Step 2: Apply Row 2 Number and Sign
        const row2 = config[1];

        let max2 = row2.max;
        if (row1.sign === '-') {
            // Ensure result not negative: num1 - num2 >= 0 => num2 <= num1
            max2 = Math.min(row2.max, currentResult);
        }
        // Safeguard if min > max
        const min2 = Math.min(row2.min, max2);

        const num2 = getRandomInt(min2, max2);
        equationParts.push({ value: num2, type: 'number', el: null });

        // Calculate intermediate
        if (row1.sign === '+') currentResult += num2;
        else if (row1.sign === '-') currentResult -= num2; // Though generic parser would be better, prompt implies specific sequence

        equationParts.push({ value: row2.sign, type: 'operator', el: null });

        // Step 3: Apply Row 3 Number and =
        const row3 = config[2];

        let max3 = row3.max;
        if (row2.sign === '-') {
            // Ensure result not negative: currentResult - num3 >= 0 => num3 <= currentResult
            max3 = Math.min(row3.max, currentResult);
        }
        const min3 = Math.min(row3.min, max3);

        const num3 = getRandomInt(min3, max3);
        equationParts.push({ value: num3, type: 'number', el: null });

        // Calculate final result before storing
        if (row2.sign === '+') currentResult += num3;
        else if (row2.sign === '-') currentResult -= num3;

        equationParts.push({ value: '=', type: 'equals', el: null });
        equationParts.push({ value: '?', type: 'question-mark', el: null }); // Final placeholder
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
        // Step 1: Num1 (idx 0) op1 (idx 1) Num2 (idx 2)
        steps.push({
            startIdx: 0,
            opIdx: 1,
            endIdx: 2,
            result: getPartialResult(0, 2)
        });

        // Step 2: Result of Step 1 ... op2 (idx 3) Num3 (idx 4)
        // Visually, the arc usually connects the *previous result location* to the new number.
        // However, standard math arcs often jump:
        // Step 1: Arc over Num1 and Num2.
        // Step 2: Arc from Num1 (start) to Num3 (end) OR Start of Num2 to Num3. 
        // Let's implement: Arc from Start of Eq to End of current operand.

        // Actually, typically "connect numbers by arcs"
        // Arc 1: Connects 10 and 15
        // Arc 2: Connects result of (10+15) position ??? No, usually connects 15 to 7?
        // Prompt says: "above arc which is connect 10+15 has to be input... after... push button... if correct change question mark"

        // Let's assume sequential pairs for visuals, or cumulative.
        // Cumulative is cleaner for "10+15-7".
        // Arc 1: 10 to 15. Input asks for 10+15=25.
        // Arc 2: 15 to 7? Or Start to 7? 
        // Let's do: Start of Equation to End of Current Number.

        // Step 1 target: (Num1 + Num2). Visual: Arc spanning Num1 -> Num2.
        // Step 2: Connect result of first op (visually, the end of first op) to the third number
        // Start from Num2 (idx 2) to Num3 (idx 4) for a cleaner sequential chain
        steps.push({
            startIdx: 2,
            endIdx: 4,
            result: currentResult
        });
    }

    // Helper to calc result based on the config logic explicitly
    function getPartialResult(startIdx, endIdx) {
        // Hardcoded for this 3-number structure based on prompt
        // Step 1 is just the first two numbers
        if (endIdx === 2) {
            const n1 = equationParts[0].value;
            const op = equationParts[1].value;
            const n2 = equationParts[2].value;
            if (op === '+') return n1 + n2;
            if (op === '-') return n1 - n2;
        }
        return currentResult; // Fallback
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

    function showCharacters() {
        const sheriff = document.getElementById('sheriff-container');
        const deputy = document.getElementById('deputy-container');

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

    submitBtn.addEventListener('click', () => {
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

            // Move to next
            setTimeout(() => {
                activateStep(currentStep + 1);
            }, 500);
        } else {
            // Shake or Error feedback
            inputOverlay.animate([
                { transform: 'translate(-50%, -100%) translateX(0)' },
                { transform: 'translate(-50%, -100%) translateX(-10px)' },
                { transform: 'translate(-50%, -100%) translateX(10px)' },
                { transform: 'translate(-50%, -100%) translateX(0)' }
            ], { duration: 300 });
        }
    });

    function saveGameHistory() {
        const historyItem = {
            timestamp: new Date().toISOString(),
            totalTime: timerEl.textContent,
            equation: equationParts.map(p => p.value).join(' ').replace(' ?', ' ' + currentResult),
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
                    time: s.duration
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
            historyList.innerHTML = '<tr><td colspan="3" style="text-align:center">No history yet</td></tr>';
        } else {
            history.forEach(item => {
                const tr = document.createElement('tr');

                const date = new Date(item.timestamp);
                const dateStr = date.toLocaleString();

                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${item.equation}</td>
                    <td>${item.totalTime}</td>
                `;
                historyList.appendChild(tr);
            });
        }

        historyModal.classList.remove('hidden');
    }
});
