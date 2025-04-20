// script.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Variable declarations
let measurementText = '';
let textX = 0;
let textY = 0;
let pdfImage = null;
let scale = 1.5;
let currentPdf = null;
let currentPage = null;
let currentPageNum = 1;
let totalPages = 1;
let points = [];
let isDrawing = false;
let allMeasurements = [];
let isAreaMode = false;
let polygonPoints = [];
let areaMeasurements = [];
let mousePos = { x: 0, y: 0 };

// DOM elements
const canvas = document.getElementById('pdf_canvas');
const ctx = canvas.getContext('2d');
const dropZone = document.getElementById('drop_zone');
const outputDiv = document.getElementById('output');
const fileInput = document.getElementById('file_input');
const selectButton = document.getElementById('select_button');
const zoomInBtn = document.getElementById('zoom_in');
const zoomOutBtn = document.getElementById('zoom_out');
const zoomResetBtn = document.getElementById('zoom_reset');
const zoomLevelSpan = document.getElementById('zoom_level');
const prevPageBtn = document.getElementById('prev_page');
const nextPageBtn = document.getElementById('next_page');
const pageInfoSpan = document.getElementById('page_info');
const pageDimensionsDiv = document.getElementById('page_dimensions');
const cursorPositionDiv = document.getElementById('cursor_position');

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // File handling
    selectButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Page navigation
    prevPageBtn.addEventListener('click', handlePrevPage);
    nextPageBtn.addEventListener('click', handleNextPage);

    // Zoom controls
    zoomInBtn.addEventListener('click', handleZoomIn);
    zoomOutBtn.addEventListener('click', handleZoomOut);
    zoomResetBtn.addEventListener('click', handleZoomReset);

    // Drag and drop
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleFileDrop);

    // Canvas interactions
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMove);
    canvas.addEventListener('mouseout', handleCanvasMouseOut);
    canvas.addEventListener('mouseover', handleCanvasMouseOver);

    // Mode toggle
    const modeToggle = document.getElementById('mode_toggle');
    if(modeToggle) {
        modeToggle.addEventListener('click', toggleMeasurementMode);
    }

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All Measurements';
    Object.assign(clearBtn.style, {
        marginLeft: '10px',
        backgroundColor: '#f44336',
        color: 'white',
        border: 'none',
        borderRadius: '3px',
        padding: '5px 10px',
        cursor: 'pointer'
    });
    clearBtn.addEventListener('click', clearMeasurements);
    document.getElementById('zoom_controls').appendChild(clearBtn);
});

// File handling functions
function handleFileSelect(e) {
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.type === 'application/pdf') {
            loadPDF(file);
        } else {
            alert('Please select a PDF file.');
        }
    }
}

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('highlight');
}

function handleDragLeave(e) {
    dropZone.classList.remove('highlight');
}

function handleFileDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('highlight');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('Please drop a PDF file.');
    }
}

// PDF loading and rendering
function loadPDF(file) {
    const reader = new FileReader();
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        alert("Error reading file");
    };
    
    reader.onload = function(e) {
        const typedarray = new Uint8Array(e.target.result);
        pdfjsLib.getDocument(typedarray).promise
            .then(pdf => {
                currentPdf = pdf;
                totalPages = pdf.numPages;
                currentPageNum = 1;
                updatePageInfo();
                loadPage(currentPageNum);
            })
            .catch(err => {
                console.error("PDF Error:", err);
                alert("Failed to load PDF: " + err.message);
            });
    };
    reader.readAsArrayBuffer(file);
}

function loadPage(pageNumber) {
    currentPdf.getPage(pageNumber)
        .then(page => {
            currentPage = page;
            renderPage(page);
            updateZoomLevel();
        })
        .catch(err => console.error("Page load error:", err));
}

function renderPage(page) {
    const viewport = page.getViewport({ scale: scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    page.render({
        canvasContext: ctx,
        viewport: viewport
    }).promise.then(() => {
        pdfImage = new Image();
        pdfImage.src = canvas.toDataURL();
        updatePageDimensions(viewport.width, viewport.height);
        redrawAllMeasurements();
    });
}

// Measurement functions
function handleCanvasClick(e) {
    if (!pdfImage) return;

    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (isAreaMode) {
        handleAreaClick(x, y);
    } else {
        handleLineClick(x, y, e.ctrlKey);
    }
}

function handleLineClick(x, y, isSnapping) {
    if (points.length === 2) {
        finalizeLineMeasurement();
    }

    if (points.length === 1 && isSnapping) {
        const firstPoint = points[0];
        const dx = x - firstPoint.x;
        const dy = y - firstPoint.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            y = firstPoint.y;
        } else {
            x = firstPoint.x;
        }
    }

    points.push({ x, y });
    drawMeasurementCross(x, y);

    if (points.length === 2) {
        finalizeLineMeasurement();
    }
}

function handleAreaClick(x, y) {
    // Check if clicking near first point to close polygon
    if (polygonPoints.length > 2) {
        const firstPoint = polygonPoints[0];
        const distance = Math.sqrt(Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2));
        if (distance < 10) {
            x = firstPoint.x;
            y = firstPoint.y;
        }
    }

    polygonPoints.push({ x, y });
    drawMeasurementCross(x, y);

    // Auto-close polygon if clicked on first point
    if (polygonPoints.length > 2 && 
        x === polygonPoints[0].x && 
        y === polygonPoints[0].y) {
        finalizeAreaMeasurement();
    }
}

function finalizeLineMeasurement() {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const dist_px = Math.sqrt(dx * dx + dy * dy);
    const dist_in = dist_px / (scale * 72);
    const dist_mm = dist_in * 25.4;
    
    measurementText = `${dist_px.toFixed(1)}px, ${dist_in.toFixed(2)}in, ${dist_mm.toFixed(1)}mm`;
    
    textX = points[1].x + 10;
    textY = points[1].y + 10;
    
    ctx.font = '14px Arial';
    const textWidth = ctx.measureText(measurementText).width;
    if (textX + textWidth > canvas.width) {
        textX = points[1].x - textWidth - 10;
    }
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(textX - 3, textY - 14, textWidth + 6, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(measurementText, textX, textY);
    
    allMeasurements.push({
        points: [...points],
        text: measurementText,
        textX,
        textY
    });
    
    resetLineMeasurement();
}

function finalizeAreaMeasurement() {
    if (polygonPoints.length < 3) return;

    const areaPx = calculatePolygonArea(polygonPoints);
    const areaIn = areaPx / Math.pow(scale * 72, 2);
    const areaMm = areaIn * 645.16;
    const center = getPolygonCenter(polygonPoints);

    areaMeasurements.push({
        points: [...polygonPoints],
        area: { px: areaPx, in: areaIn, mm: areaMm },
        textPosition: center
    });

    resetAreaMeasurement();
    redrawAllMeasurements();
}

function calculatePolygonArea(points) {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

function getPolygonCenter(points) {
    return points.reduce((acc, p) => {
        acc.x += p.x;
        acc.y += p.y;
        return acc;
    }, { x: 0, y: 0 }).map(v => v / points.length);
}

function drawMeasurementCross(x, y) {
    const crossSize = 8;
    ctx.beginPath();
    ctx.moveTo(x - crossSize, y);
    ctx.lineTo(x + crossSize, y);
    ctx.moveTo(x, y - crossSize);
    ctx.lineTo(x, y + crossSize);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawArrow(fromX, fromY, toX, toY) {
    const headLength = 10;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLength * Math.cos(angle - Math.PI/6),
        toY - headLength * Math.sin(angle - Math.PI/6)
    );
    ctx.lineTo(
        toX - headLength * Math.cos(angle + Math.PI/6),
        toY - headLength * Math.sin(angle + Math.PI/6)
    );
    ctx.lineTo(toX, toY);
    ctx.fillStyle = 'green';
    ctx.fill();
}

// UI update functions
function updatePageDimensions(widthPx, heightPx) {
    const widthIn = widthPx / (scale * 72);
    const heightIn = heightPx / (scale * 72);
    const widthMm = widthIn * 25.4;
    const heightMm = heightIn * 25.4;
    
    pageDimensionsDiv.innerHTML = `
        Page Size: 
        ${widthPx.toFixed(0)} × ${heightPx.toFixed(0)} px | 
        ${widthIn.toFixed(2)} × ${heightIn.toFixed(2)} in | 
        ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm
    `;
}

function updatePageInfo() {
    pageInfoSpan.textContent = `Page ${currentPageNum} of ${totalPages}`;
    prevPageBtn.disabled = currentPageNum <= 1;
    nextPageBtn.disabled = currentPageNum >= totalPages;
    prevPageBtn.style.opacity = currentPageNum <= 1 ? '0.5' : '1';
    nextPageBtn.style.opacity = currentPageNum >= totalPages ? '0.5' : '1';
}

function updateZoomLevel() {
    zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
}

// Navigation controls
function handlePrevPage() {
    if (currentPdf && currentPageNum > 1) {
        currentPageNum--;
        loadPage(currentPageNum);
    }
}

function handleNextPage() {
    if (currentPdf && currentPageNum < totalPages) {
        currentPageNum++;
        loadPage(currentPageNum);
    }
}

// Zoom controls
function handleZoomIn() {
    if (currentPage) {
        scale += 0.25;
        renderPage(currentPage);
        updateZoomLevel();
    }
}

function handleZoomOut() {
    if (currentPage && scale > 0.5) {
        scale -= 0.25;
        renderPage(currentPage);
        updateZoomLevel();
    }
}

function handleZoomReset() {
    if (currentPage) {
        scale = 1.5;
        renderPage(currentPage);
        updateZoomLevel();
    }
}

// Mode toggle
function toggleMeasurementMode() {
    isAreaMode = !isAreaMode;
    const modeToggle = document.getElementById('mode_toggle');
    if (modeToggle) {
        modeToggle.textContent = isAreaMode ? 'Switch to Line Mode' : 'Switch to Area Mode';
    }
    resetMeasurementState();
}

function resetMeasurementState() {
    points = [];
    polygonPoints = [];
    isDrawing = false;
    redrawAllMeasurements();
}

// Clear measurements
function clearMeasurements() {
    allMeasurements = [];
    areaMeasurements = [];
    resetMeasurementState();
    outputDiv.textContent = '';
    if (pdfImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(pdfImage, 0, 0);
    }
}

// Cursor position handling
function handleCanvasMove(e) {
    if (!currentPage) return;
    
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
    
    const viewport = currentPage.getViewport({ scale: scale });
    const pdfX = mousePos.x / scale;
    const pdfY = (viewport.height / scale) - (mousePos.y / scale);
    
    cursorPositionDiv.innerHTML = `
        Computer Coordinates: [${Math.round(mousePos.x)}, ${Math.round(mousePos.y)}] px<br>
        PDF Coordinates: [${pdfX.toFixed(1)}, ${pdfY.toFixed(1)}] pt
    `;

    // Redraw preview
    if (pdfImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(pdfImage, 0, 0);
        redrawAllMeasurements();

        if (isAreaMode) {
            drawAreaPreview();
        } else {
            drawLinePreview();
        }
    }
}

function drawAreaPreview() {
    // Draw existing polygon points and lines
    polygonPoints.forEach((p, i) => {
        drawMeasurementCross(p.x, p.y);
        if (i > 0) {
            ctx.beginPath();
            ctx.moveTo(polygonPoints[i-1].x, polygonPoints[i-1].y);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = 'green';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    // Draw preview arrow
    if (polygonPoints.length > 0) {
        drawArrow(
            polygonPoints[polygonPoints.length-1].x,
            polygonPoints[polygonPoints.length-1].y,
            mousePos.x,
            mousePos.y
        );
    }
}

function drawLinePreview() {
    if (points.length === 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function handleCanvasMouseOut() {
    cursorPositionDiv.style.display = 'none';
}

function handleCanvasMouseOver() {
    cursorPositionDiv.style.display = 'block';
}

// Redraw all measurements
function redrawAllMeasurements() {
    if (!pdfImage) return;

    // Redraw line measurements
    allMeasurements.forEach(measurement => {
        measurement.points.forEach(point => {
            drawMeasurementCross(point.x, point.y);
        });
        
        ctx.beginPath();
        ctx.moveTo(measurement.points[0].x, measurement.points[0].y);
        ctx.lineTo(measurement.points[1].x, measurement.points[1].y);
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(measurement.textX - 3, measurement.textY - 14, 
                    ctx.measureText(measurement.text).width + 6, 20);
        ctx.fillStyle = 'black';
        ctx.fillText(measurement.text, measurement.textX, measurement.textY);
    });

    // Redraw area measurements
    areaMeasurements.forEach(measurement => {
        // Draw polygon
        ctx.beginPath();
        ctx.moveTo(measurement.points[0].x, measurement.points[0].y);
        measurement.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0, 200, 0, 0.5)';
        ctx.fillStyle = 'rgba(0, 200, 0, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fill();

        // Draw area text
        const text = `${measurement.area.in.toFixed(2)} in²\n${measurement.area.mm.toFixed(0)} mm²`;
        ctx.font = '14px Arial';
        const textMetrics = ctx.measureText(text);
        const textHeight = 30;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(
            measurement.textPosition.x - textMetrics.width/2 - 5,
            measurement.textPosition.y - textHeight/2 - 5,
            textMetrics.width + 10,
            textHeight + 10
        );

        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        text.split('\n').forEach((line, i) => {
            ctx.fillText(
                line,
                measurement.textPosition.x,
                measurement.textPosition.y + (i - 0.5) * 16
            );
        });
    });
}

// Reset functions
function resetLineMeasurement() {
    points = [];
    outputDiv.textContent = '';
    isDrawing = false;
    redrawAllMeasurements();
}

function resetAreaMeasurement() {
    polygonPoints = [];
    outputDiv.textContent = '';
    isDrawing = false;
    redrawAllMeasurements();
}



