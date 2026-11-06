// Enhanced global variables and error handling
let presentationMap = null;
let markersLayer = null;
let currentSlide = 0;
let totalSlides = 0;
let isMapInitialized = false;
let mapInitRetries = 0;
const MAX_MAP_RETRIES = 3;
const MAP_INIT_DELAY = 1000;

// Performance monitoring
const performanceMetrics = {
    initStart: performance.now(),
    mapLoadStart: null,
    mapLoadEnd: null,
    dataLoadStart: null,
    dataLoadEnd: null
};

// Enhanced utility functions
function formatCurrency(value) {
    const numValue = parseInt(value);
    if (isNaN(numValue)) return 'Rp 0';
    
    if (numValue >= 1000000000000000) {
        return `Rp ${(numValue / 1000000000000000).toFixed(1)} Kuadriliun`;
    } else if (numValue >= 1000000000000) {
        return `Rp ${(numValue / 1000000000000).toFixed(1)} Triliun`;
    } else if (numValue >= 1000000000) {
        return `Rp ${(numValue / 1000000000).toFixed(1)} Miliar`;
    } else if (numValue >= 1000000) {
        return `Rp ${(numValue / 1000000).toFixed(1)} Juta`;
    }
    return `Rp ${numValue.toLocaleString('id-ID')}`;
}

// Enhanced error handling utilities
function logError(context, error, data = {}) {
    console.error(`[${context}] Error:`, error, data);
    
    // Could send to monitoring service in production
    if (window.analytics) {
        window.analytics.track('error', {
            context,
            error: error.message,
            stack: error.stack,
            ...data
        });
    }
}

function showErrorState(containerId, message, retryCallback = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const errorHtml = `
        <div class="error-state show">
            <div class="error-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="error-title">Terjadi Kesalahan</div>
            <div class="error-message">${message}</div>
            ${retryCallback ? `<button class="retry-btn" onclick="${retryCallback}()">Coba Lagi</button>` : ''}
        </div>
    `;
    
    container.innerHTML = errorHtml;
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// Enhanced search with debouncing
let searchTimeout;
function debounceSearch(func, delay = 300) {
    return function(...args) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Keyboard navigation and accessibility
function handleKeyboardNavigation(event) {
    // Don't interfere with search input or modal inputs
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        if (event.target.id !== 'regionSearch') {
            return;
        }
    }

    // Don't interfere when modals are open
    if (document.querySelector('.sector-modal.active') || document.querySelector('.help-modal.active')) {
        return;
    }

    switch(event.key) {
        case 'ArrowRight':
        case ' ':
            event.preventDefault();
            nextSlide();
            break;
        case 'ArrowLeft':
            event.preventDefault();
            previousSlide();
            break;
        case 'Home':
            event.preventDefault();
            resetPresentation();
            break;
        case 'Escape':
            event.preventDefault();
            closeSectorModal();
            closeHelpModal();
            closeMapPopups();
            clearSearch();
            break;
        case 'F11':
            event.preventDefault();
            toggleFullscreen();
            break;
        case 'F1':
        case '?':
            event.preventDefault();
            showHelpModal();
            break;
        case 'M':
        case 'm':
            if (!event.target.matches('input, textarea')) {
                event.preventDefault();
                showMapOverview();
            }
            break;
        case '/':
            if (!event.target.matches('input, textarea')) {
                event.preventDefault();
                const searchInput = document.getElementById('regionSearch');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
            break;
        case 'Enter':
            if (event.target.classList.contains('region-item')) {
                event.target.click();
            } else if (event.target.classList.contains('sector-card') && !event.target.classList.contains('no-data')) {
                event.target.click();
            }
            break;
    }
}

// Enhanced initialization with error handling
async function initializePresentation() {
    try {
        performanceMetrics.dataLoadStart = performance.now();
        
        // Validate data first
        if (!validateData()) {
            throw new Error('Data validation failed');
        }

        // Initialize UI components
        await populateRegionList();
        await createRegionSlides();
        updateMapStats();
        updateProgress();
        updateNavigationButtons();
        initializeSearch();
        
        performanceMetrics.dataLoadEnd = performance.now();
        
        // Temporary map-only mode: start on map slide
        if (document.body.classList.contains('map-only-mode')) {
            currentSlide = 1;
            updateProgress();
            updateNavigationButtons();
        }

        // Initialize map with delay for better UX
        setTimeout(async () => {
            await initializeMapWithRetry();
            if (document.body.classList.contains('map-only-mode') && presentationMap) {
                setTimeout(() => {
                    presentationMap.invalidateSize();
                    if (typeof fitNriMap === 'function') fitNriMap();
                }, 120);
            }
        }, 500);
        
        // Hide loading overlay
        setTimeout(hideLoadingOverlay, 1000);
        
        console.log('Presentation initialized successfully');
        console.log('Performance metrics:', {
            totalInit: performanceMetrics.dataLoadEnd - performanceMetrics.initStart,
            dataLoad: performanceMetrics.dataLoadEnd - performanceMetrics.dataLoadStart
        });
        
    } catch (error) {
        logError('initializePresentation', error);
        hideLoadingOverlay();
        showErrorState('main-content', 'Gagal memuat dashboard. Silakan refresh halaman.', 'location.reload');
    }
}

// Data validation
function validateData() {
    try {
        if (!investmentData || typeof investmentData !== 'object') {
            throw new Error('Invalid investment data structure');
        }

        const requiredFields = ['name', 'type', 'population', 'totalInvestment', 'totalCompanies', 'sectors'];
        
        for (const regionKey of Object.keys(investmentData)) {
            const region = investmentData[regionKey];
            
            for (const field of requiredFields) {
                if (!(field in region)) {
                    throw new Error(`Missing field ${field} in region ${regionKey}`);
                }
            }
            
            if (!regionCoordinates[regionKey]) {
                console.warn(`Missing coordinates for region: ${regionKey}`);
            }
        }
        
        return true;
    } catch (error) {
        logError('validateData', error);
        return false;
    }
}

// Enhanced map initialization with retry logic
async function initializeMapWithRetry() {
    if (isMapInitialized) return;
    
    try {
        performanceMetrics.mapLoadStart = performance.now();
        await initializeMap();
        isMapInitialized = true;
        performanceMetrics.mapLoadEnd = performance.now();
        
        console.log('Map load time:', performanceMetrics.mapLoadEnd - performanceMetrics.mapLoadStart, 'ms');
        
    } catch (error) {
        logError('initializeMap', error, { retry: mapInitRetries });
        
        if (mapInitRetries < MAX_MAP_RETRIES) {
            mapInitRetries++;
            console.log(`Retrying map initialization (${mapInitRetries}/${MAX_MAP_RETRIES})`);
            setTimeout(() => initializeMapWithRetry(), MAP_INIT_DELAY * mapInitRetries);
        } else {
            console.error('Max map initialization retries reached');
            showMapError();
        }
    }
}

function initializeMap() {
    return new Promise((resolve, reject) => {
        try {
            const mapContainer = document.getElementById('presentationMap');
            if (!mapContainer) {
                throw new Error('Map container not found');
            }

            // Check if Leaflet is loaded
            if (typeof L === 'undefined') {
                throw new Error('Leaflet library not loaded');
            }

            // Initialize map centered on NTB
            presentationMap = L.map('presentationMap', {
                zoomControl: false,
                minZoom: 6,
                maxZoom: 14,
                zoomSnap: 0.25,
                attributionControl: true
            }).setView([-8.65, 117.36], 8);

            const tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 16,
                attribution: 'Peta &copy; Esri · Batas wilayah geoBoundaries (CC BY 4.0) · Angka DPMPTSP NTB'
            });

            tileLayer.on('tileerror', (e) => {
                console.warn('Tile load error:', e);
            });

            presentationMap.addLayer(tileLayer);

            L.control.zoom({
                position: 'bottomright'
            }).addTo(presentationMap);

            renderInvestmentChoropleth(presentationMap).then(resolve).catch(reject);
            return;
            
        } catch (error) {
            reject(error);
        }
    });
}

function showMapError() {
    const mapError = document.getElementById('mapError');
    const mapContainer = document.querySelector('#presentationMap');
    
    if (mapError && mapContainer) {
        mapContainer.style.display = 'none';
        mapError.classList.add('show');
    }
}

function retryMapLoad() {
    const mapError = document.getElementById('mapError');
    const mapContainer = document.querySelector('#presentationMap');
    
    if (mapError && mapContainer) {
        mapError.classList.remove('show');
        mapContainer.style.display = 'block';
    }
    
    mapInitRetries = 0;
    isMapInitialized = false;
    
    // Cleanup existing map
    if (presentationMap) {
        try {
            presentationMap.remove();
            presentationMap = null;
            markersLayer = null;
        } catch (e) {
            console.warn('Error cleaning up map:', e);
        }
    }
    
    initializeMapWithRetry();
}

function addRegionMarkers() {
    if (!markersLayer) {
        console.error('Markers layer not initialized');
        return;
    }

    regions.forEach(regionKey => {
        const region = investmentData[regionKey];
        const coords = regionCoordinates[regionKey];
        
        if (!coords || !region) {
            console.warn(`Missing data for region: ${regionKey}`);
            return;
        }

        try {
            // Calculate marker size based on investment
            const investmentValue = region.totalInvestment;
            let markerSize = 15;
            if (investmentValue > 100000000000000) markerSize = 25;
            else if (investmentValue > 10000000000000) markerSize = 22;
            else if (investmentValue > 1000000000000) markerSize = 20;
            else if (investmentValue > 100000000000) markerSize = 18;

            // Determine marker style based on region type
            let markerColor, markerIcon;
            if (region.type === 'Ibu Kota') {
                markerColor = 'linear-gradient(135deg, #f093fb, #f5576c)';
                markerIcon = 'fa-star';
            } else if (region.type === 'Provinsi') {
                markerColor = 'linear-gradient(135deg, #43e97b, #38f9d7)';
                markerIcon = 'fa-flag';
            } else if (region.type === 'Kota') {
                markerColor = 'linear-gradient(135deg, #4facfe, #00f2fe)';
                markerIcon = 'fa-building';
            } else {
                markerColor = 'linear-gradient(135deg, #667eea, #764ba2)';
                markerIcon = 'fa-mountain';
            }

            // Create custom marker
            const customIcon = L.divIcon({
                html: `
                    <div style="
                        width: ${markerSize * 2}px;
                        height: ${markerSize * 2}px;
                        background: ${markerColor};
                        border: 3px solid white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: ${markerSize * 0.6}px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        cursor: pointer;
                        transition: all 0.3s ease;
                        animation: markerPulse 2s infinite;
                    ">
                        <i class="fas ${markerIcon}"></i>
                    </div>
                `,
                className: 'custom-map-marker',
                iconSize: [markerSize * 2, markerSize * 2],
                iconAnchor: [markerSize, markerSize]
            });

            // Create marker
            const marker = L.marker([coords[1], coords[0]], { icon: customIcon });

            // Create popup content
            const popupContent = createMapPopupContent(region, regionKey);
            
            marker.bindPopup(popupContent, {
                maxWidth: 300,
                className: 'custom-map-popup',
                closeButton: true,
                autoClose: false,
                autoPan: true,
                keepInView: true
            });

            // Add hover effects for tooltip only
            marker.on('mouseover', function() {
                if (!this.isPopupOpen()) {
                    this.openTooltip();
                }
            });

            marker.on('mouseout', function() {
                this.closeTooltip();
            });

            // Add click handler to open popup
            marker.on('click', function(e) {
                // Close all other popups first
                presentationMap.eachLayer(function(layer) {
                    if (layer !== marker && layer.closePopup) {
                        layer.closePopup();
                    }
                });
                
                // Open this popup
                this.openPopup();
                
                // Prevent event bubbling
                L.DomEvent.stopPropagation(e);
            });

            // Add tooltip
            marker.bindTooltip(`
                <div style="text-align: center; font-weight: 600;">
                    <div>${region.name}</div>
                    <div style="font-size: 10px; opacity: 0.8;">${formatCurrency(region.totalInvestment)}</div>
                </div>
            `, {
                permanent: false,
                direction: 'top',
                className: 'custom-map-tooltip',
                offset: [0, -10]
            });

            markersLayer.addLayer(marker);
        } catch (error) {
            logError(`createMarker-${regionKey}`, error);
        }
    });
}

function createMapPopupContent(region, regionKey) {
    const activeSectors = Object.keys(region.sectors).length;
    
    return `
        <div class="map-popup">
            <div class="popup-header">
                <div class="popup-region-name">${region.name}</div>
                <div class="popup-region-type">${region.type}</div>
            </div>
            <div class="popup-body">
                <div class="popup-stats">
                    <div class="popup-stat">
                        <div class="popup-stat-value">${region.totalCompanies}</div>
                        <div class="popup-stat-label">Perusahaan</div>
                    </div>
                    <div class="popup-stat">
                        <div class="popup-stat-value">${activeSectors}</div>
                        <div class="popup-stat-label">Sektor Aktif</div>
                    </div>
                </div>
                <div style="text-align: center; margin: 10px 0;">
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-green);">
                        ${formatCurrency(region.totalInvestment)}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-light);">
                        Total Investasi
                    </div>
                </div>
                <div class="popup-actions">
                    <button class="popup-btn primary" onclick="goToRegionDetail('${regionKey}'); event.stopPropagation();" aria-label="Lihat detail ${region.name}">
                        <i class="fas fa-chart-bar"></i> Detail
                    </button>
                    <button class="popup-btn secondary" onclick="closeMapPopups(); event.stopPropagation();" aria-label="Tutup popup">
                        <i class="fas fa-times"></i> Tutup
                    </button>
                </div>
            </div>
        </div>
    `;
}

function updateMapStats() {
    try {
        const totalCompanies = regions.reduce((sum, regionKey) => 
            sum + (investmentData[regionKey]?.totalCompanies || 0), 0);
        const totalInvestment = regions.reduce((sum, regionKey) => 
            sum + (investmentData[regionKey]?.totalInvestment || 0), 0);

        const mapTotalCompanies = document.getElementById('mapTotalCompanies');
        const mapTotalInvestment = document.getElementById('mapTotalInvestment');
        
        if (mapTotalCompanies) mapTotalCompanies.textContent = totalCompanies;
        if (mapTotalInvestment) mapTotalInvestment.textContent = formatCurrency(totalInvestment);
    } catch (error) {
        logError('updateMapStats', error);
    }
}

// Enhanced region list population
async function populateRegionList() {
    try {
        const regionList = document.getElementById('regionList');
        if (!regionList) throw new Error('Region list container not found');
        
        regionList.innerHTML = '';

        regions.forEach((regionKey, index) => {
            const region = investmentData[regionKey];
            const regionItem = document.createElement('div');
            regionItem.className = 'region-item';
            regionItem.setAttribute('data-region', regionKey);
            regionItem.setAttribute('data-slide', index + 2); // +2 for welcome and map slides
            regionItem.setAttribute('data-search', region.name.toLowerCase());
            regionItem.setAttribute('tabindex', '0');
            regionItem.setAttribute('role', 'button');
            regionItem.setAttribute('aria-label', `Lihat detail investasi ${region.name}`);
            
            regionItem.innerHTML = `
                <div class="region-name">${region.name}</div>
                <div class="region-stats">
                    <span>${region.totalCompanies} Perusahaan</span>
                    <span class="region-investment">${formatCurrency(region.totalInvestment)}</span>
                </div>
            `;
            
            regionItem.addEventListener('click', () => {
                showRegionSlide(index + 2);
                updateActiveRegion(regionKey);
            });
            
            regionItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    regionItem.click();
                }
            });
            
            regionList.appendChild(regionItem);
        });
        
        totalSlides = regions.length + 2; // +2 for welcome and map slides
        
    } catch (error) {
        logError('populateRegionList', error);
        throw error;
    }
}

// Enhanced search initialization
function initializeSearch() {
    try {
        const searchInput = document.getElementById('regionSearch');
        const searchClear = document.getElementById('searchClear');
        
        if (!searchInput || !searchClear) return;
        
        const debouncedFilter = debounceSearch(filterRegions);
        
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();
            
            if (query.length > 0) {
                searchClear.classList.add('show');
                debouncedFilter(query);
            } else {
                searchClear.classList.remove('show');
                showAllRegions();
            }
        });
        
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                clearSearch();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const firstVisibleRegion = document.querySelector('.region-item:not(.hidden)');
                if (firstVisibleRegion) {
                    firstVisibleRegion.focus();
                }
            }
        });
        
        // Add ARIA live region for search results
        const searchResults = document.createElement('div');
        searchResults.id = 'searchResults';
        searchResults.setAttribute('aria-live', 'polite');
        searchResults.setAttribute('aria-atomic', 'true');
        searchResults.style.position = 'absolute';
        searchResults.style.left = '-9999px';
        document.body.appendChild(searchResults);
        
    } catch (error) {
        logError('initializeSearch', error);
    }
}

function filterRegions(query) {
    try {
        const regionItems = document.querySelectorAll('.region-item');
        const noResults = document.getElementById('noResults');
        const searchResults = document.getElementById('searchResults');
        let visibleCount = 0;
        
        regionItems.forEach(item => {
            const searchText = item.getAttribute('data-search');
            const regionName = item.querySelector('.region-name').textContent.toLowerCase();
            
            if (searchText.includes(query) || regionName.includes(query)) {
                item.classList.remove('hidden');
                visibleCount++;
            } else {
                item.classList.add('hidden');
            }
        });
        
        if (visibleCount === 0) {
            noResults.classList.add('show');
            if (searchResults) {
                searchResults.textContent = 'Tidak ada wilayah yang ditemukan';
            }
        } else {
            noResults.classList.remove('show');
            if (searchResults) {
                searchResults.textContent = `${visibleCount} wilayah ditemukan`;
            }
        }
    } catch (error) {
        logError('filterRegions', error);
    }
}

function showAllRegions() {
    try {
        const regionItems = document.querySelectorAll('.region-item');
        const noResults = document.getElementById('noResults');
        const searchResults = document.getElementById('searchResults');
        
        regionItems.forEach(item => {
            item.classList.remove('hidden');
        });
        
        noResults.classList.remove('show');
        if (searchResults) {
            searchResults.textContent = '';
        }
    } catch (error) {
        logError('showAllRegions', error);
    }
}

function clearSearch() {
    try {
        const searchInput = document.getElementById('regionSearch');
        const searchClear = document.getElementById('searchClear');
        
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        
        if (searchClear) {
            searchClear.classList.remove('show');
        }
        
        showAllRegions();
    } catch (error) {
        logError('clearSearch', error);
    }
}

// Help modal functions
function showHelpModal() {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.add('active');
        
        // Focus management
        const helpClose = helpModal.querySelector('.help-close');
        if (helpClose) {
            helpClose.focus();
        }
        
        // Trap focus within modal
        trapFocus(helpModal);
    }
}

function closeHelpModal() {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        helpModal.classList.remove('active');
    }
}

// Enhanced modal functions with focus management
function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        }
    });
}

// Enhanced sector modal functions
function showSectorDetail(sectorName, regionKey) {
    try {
        const region = investmentData[regionKey];
        const sectorData = region.sectors[sectorName] || [];
        
        if (sectorData.length === 0) return;
        
        // Sort by investment amount
        const sortedInvestors = [...sectorData].sort((a, b) => b.investment - a.investment);
        
        const modal = document.getElementById('sectorModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        if (!modal || !modalTitle || !modalBody) return;
        
        const sectorIcon = allSectors.find(s => s.name === sectorName)?.icon || 'fa-chart-line';
        
        modalTitle.innerHTML = `
            <i class="fas ${sectorIcon}" aria-hidden="true"></i>
            <span>${sectorName} - ${region.name}</span>
        `;
        
        const investorCards = sortedInvestors.map((investor, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            
            return `
                <article class="investor-card">
                    <div class="investor-rank">
                        <div class="rank-number ${rankClass}" aria-label="Peringkat ${index + 1}">${index + 1}</div>
                        <div class="investor-name">${investor.name}</div>
                        <div class="investor-type ${investor.type}">${investor.type}</div>
                    </div>
                    <div class="investor-details">
                        <div class="detail-item">
                            <i class="fas fa-map-marker-alt detail-icon" aria-hidden="true"></i>
                            <span>${investor.district}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-code detail-icon" aria-hidden="true"></i>
                            <span>KBLI: ${investor.kbli} </span>
                        </div>
                    </div>
                    <div class="investor-investment">Realisasi Investasi ${formatCurrency(investor.investment)}</div>
                    <div style="margin-top: 10px; padding: 10px; background: var(--light-bg); border-radius: 8px; font-size: 0.85rem; color: var(--text-light);">
                        ${investor.description}
                    </div>
                </article>
            `;
        }).join('');
        
        modalBody.innerHTML = `
            <div class="top-investors-grid">
                ${investorCards}
            </div>
        `;
        
        modal.classList.add('active');
        
        // Focus management
        const modalClose = modal.querySelector('.modal-close');
        if (modalClose) {
            modalClose.focus();
        }
        
        trapFocus(modal);
        
    } catch (error) {
        logError('showSectorDetail', error, { sectorName, regionKey });
    }
}

function closeSectorModal() {
    const modal = document.getElementById('sectorModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Enhanced slide management functions
function showRegionSlide(slideNumber) {
    try {
        // Hide all slides
        document.querySelectorAll('.slide').forEach(slide => {
            slide.classList.remove('active');
        });
        
        // Show target slide
        if (slideNumber === 0) {
            document.getElementById('welcomeSlide').classList.add('active');
            currentSlide = 0;
        } else if (slideNumber === 'map' || slideNumber === 1) {
            document.getElementById('mapOverviewSlide').classList.add('active');
            currentSlide = 1;
            // Refresh map after showing
            setTimeout(() => {
                if (presentationMap) {
                    try {
                        presentationMap.invalidateSize();
                    } catch (error) {
                        logError('mapInvalidateSize', error);
                    }
                }
            }, 100);
        } else {
            const regionSlideIndex = slideNumber - 2; // Adjust for welcome and map slides
            const targetSlide = document.getElementById(`slide-${regionSlideIndex + 1}`);
            if (targetSlide) {
                targetSlide.classList.add('active');
            }
            currentSlide = slideNumber;
        }
        
        updateProgress();
        updateNavigationButtons();
        updateMapNavButton();
        
    } catch (error) {
        logError('showRegionSlide', error, { slideNumber });
    }
}

function nextSlide() {
    if (currentSlide < totalSlides - 1) {
        const nextSlideNumber = currentSlide + 1;
        showRegionSlide(nextSlideNumber);
        
        if (nextSlideNumber > 1) { // Region slides start from index 2
            const regionKey = regions[nextSlideNumber - 2];
            updateActiveRegion(regionKey);
        } else {
            document.querySelectorAll('.region-item').forEach(item => {
                item.classList.remove('active');
            });
        }
    }
}

function previousSlide() {
    if (currentSlide > 0) {
        const prevSlideNumber = currentSlide - 1;
        showRegionSlide(prevSlideNumber);
        
        if (prevSlideNumber > 1) { // Region slides start from index 2
            const regionKey = regions[prevSlideNumber - 2];
            updateActiveRegion(regionKey);
        } else {
            document.querySelectorAll('.region-item').forEach(item => {
                item.classList.remove('active');
            });
        }
    }
}

function updateActiveRegion(regionKey) {
    try {
        document.querySelectorAll('.region-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`[data-region="${regionKey}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            
            // Scroll into view if needed
            activeItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    } catch (error) {
        logError('updateActiveRegion', error, { regionKey });
    }
}

function updateNavigationButtons() {
    try {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) {
            prevBtn.disabled = currentSlide === 0;
            prevBtn.setAttribute('aria-label', 
                currentSlide === 0 ? 'Slide sebelumnya (tidak tersedia)' : 'Slide sebelumnya');
        }
        
        if (nextBtn) {
            nextBtn.disabled = currentSlide === totalSlides - 1;
            nextBtn.setAttribute('aria-label', 
                currentSlide === totalSlides - 1 ? 'Slide berikutnya (tidak tersedia)' : 'Slide berikutnya');
        }
    } catch (error) {
        logError('updateNavigationButtons', error);
    }
}

function updateProgress() {
    try {
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            const progress = totalSlides > 1 ? (currentSlide / (totalSlides - 1)) * 100 : 0;
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', Math.round(progress));
            progressBar.setAttribute('aria-valuetext', `${currentSlide + 1} dari ${totalSlides} slide`);
        }
    } catch (error) {
        logError('updateProgress', error);
    }
}

function updateMapNavButton() {
    try {
        const mapNavButton = document.getElementById('mapNavButton');
        if (mapNavButton) {
            if (currentSlide === 1) { // Map slide
                mapNavButton.style.display = 'none';
            } else {
                mapNavButton.style.display = 'flex';
            }
        }
    } catch (error) {
        logError('updateMapNavButton', error);
    }
}

// Enhanced region slides creation
async function createRegionSlides() {
    try {
        const slideContent = document.querySelector('.slide-content');
        if (!slideContent) throw new Error('Slide content container not found');
        
        regions.forEach((regionKey, index) => {
            const region = investmentData[regionKey];
            const slide = document.createElement('section');
            slide.className = 'slide';
            slide.id = `slide-${index + 1}`;
            slide.setAttribute('aria-labelledby', `region-title-${index}`);
            
            // Get sectors for this region
            const regionSectors = Object.keys(region.sectors);
            
            // Create sector cards with data from the region
            const sectorCards = allSectors.map(sector => {
                const hasData = regionSectors.includes(sector.name);
                const sectorData = hasData ? region.sectors[sector.name] : [];
                const totalInvestment = sectorData.reduce((sum, investor) => sum + investor.investment, 0);
                
                return `
                    <article class="sector-card ${hasData ? '' : 'no-data'}" 
                             data-has-data="${hasData}"
                             tabindex="0"
                             role="button"
                             aria-label="${hasData ? `Lihat detail sektor ${sector.name} dengan ${sectorData.length} investor` : `Sektor ${sector.name} tidak memiliki data`}"
                             ${hasData ? `onclick="showSectorDetail('${sector.name}', '${regionKey}')"` : ''}>
                        <div class="sector-header">
                            <div class="sector-icon" aria-hidden="true">
                                <i class="fas ${sector.icon}"></i>
                            </div>
                            <div class="sector-info">
                                <h3>${sector.name}</h3>
                                <div class="sector-count">
                                    ${hasData ? `${sectorData.length} Investor` : 'Tidak ada data'}
                                </div>
                            </div>
                        </div>
                        <div class="sector-stats">
                            <div class="sector-investment">
                                ${hasData ? formatCurrency(totalInvestment) : '-'}
                            </div>
                            <div class="sector-arrow" aria-hidden="true">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                    </article>
                `;
            }).join('');
            
            slide.innerHTML = `
                <div class="region-detail-header">
                    <div class="region-detail-title">
                        <div class="region-icon" aria-hidden="true">
                            <i class="fas ${region.type === 'Ibu Kota' ? 'fa-star' : region.type === 'Kota' ? 'fa-building' : region.type === 'Provinsi'?'fa-flag':'fa-mountain'}"></i>
                        </div>
                        <div class="region-title-text">
                            <h2 id="region-title-${index}">${region.name}</h2>
                            <p>${region.type} • Populasi: ${region.population} jiwa</p>
                        </div>
                    </div>
                    <div class="region-stats-summary" role="region" aria-label="Statistik investasi ${region.name}">
                        <div class="stat-item">
                            <div class="stat-value">${region.totalCompanies}</div>
                            <div class="stat-label">Perusahaan</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${Object.keys(region.sectors).length}</div>
                            <div class="stat-label">Sektor Aktif</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${formatCurrency(region.totalInvestment)}</div>
                            <div class="stat-label">Total Investasi</div>
                        </div>
                    </div>
                </div>
                
                <div class="sector-controls">
                    <button class="sector-toggle" 
                            id="toggleSector-${index}" 
                            onclick="toggleSectorFilter('${regionKey}', ${index})"
                            aria-label="Filter sektor aktif">
                        <i class="fas fa-filter" aria-hidden="true"></i>
                        <span>Hanya Sektor Aktif</span>
                    </button>
                    <div class="sector-count-info" id="sectorCount-${index}" role="status" aria-live="polite">
                        Menampilkan ${allSectors.length} dari ${allSectors.length} sektor
                    </div>
                </div>
                
                <div class="sectors-grid" id="sectorsGrid-${index}" role="grid" aria-label="Daftar sektor ekonomi">
                    ${sectorCards}
                </div>
            `;
            
            slideContent.appendChild(slide);
        });
        
        // Add keyboard navigation to sector cards
        document.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('sector-card') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                if (!e.target.classList.contains('no-data')) {
                    e.target.click();
                }
            }
        });
        
    } catch (error) {
        logError('createRegionSlides', error);
        throw error;
    }
}

// Enhanced sector filter function
function toggleSectorFilter(regionKey, slideIndex) {
    try {
        const toggle = document.getElementById(`toggleSector-${slideIndex}`);
        const grid = document.getElementById(`sectorsGrid-${slideIndex}`);
        const countInfo = document.getElementById(`sectorCount-${slideIndex}`);
        
        if (!toggle || !grid || !countInfo) return;
        
        const isActive = toggle.classList.contains('active');
        const region = investmentData[regionKey];
        const activeSectors = Object.keys(region.sectors).length;
        
        if (isActive) {
            // Show all sectors
            toggle.classList.remove('active');
            toggle.querySelector('span').textContent = 'Hanya Sektor Aktif';
            toggle.setAttribute('aria-label', 'Filter sektor aktif');
            
            const cards = grid.querySelectorAll('.sector-card');
            cards.forEach(card => {
                card.style.display = 'flex';
            });
            
            countInfo.textContent = `Menampilkan ${allSectors.length} dari ${allSectors.length} sektor`;
        } else {
            // Show only active sectors
            toggle.classList.add('active');
            toggle.querySelector('span').textContent = 'Semua Sektor';
            toggle.setAttribute('aria-label', 'Tampilkan semua sektor');
            
            const cards = grid.querySelectorAll('.sector-card');
            cards.forEach(card => {
                const hasData = card.getAttribute('data-has-data') === 'true';
                card.style.display = hasData ? 'flex' : 'none';
            });
            
            countInfo.textContent = `Menampilkan ${activeSectors} dari ${allSectors.length} sektor`;
        }
    } catch (error) {
        logError('toggleSectorFilter', error, { regionKey, slideIndex });
    }
}

// Map functions
function showMapOverview() {
    showRegionSlide('map');
    
    // Refresh map size after showing
    setTimeout(() => {
        if (presentationMap) {
            try {
                presentationMap.invalidateSize();
                if (typeof fitNriMap === 'function') fitNriMap();
                else presentationMap.setView([-8.6500, 117.3616], 8);
            } catch (error) {
                logError('mapRefresh', error);
            }
        }
    }, 300);
}

function resetMapView() {
    if (presentationMap) {
        try {
            if (typeof fitNriMap === 'function') fitNriMap();
            else presentationMap.setView([-8.6500, 117.3616], 8);
            closeMapPopups();
        } catch (error) {
            logError('resetMapView', error);
        }
    }
}

function toggleMapFullscreen() {
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
        try {
            if (mapContainer.requestFullscreen) {
                mapContainer.requestFullscreen();
            } else if (mapContainer.webkitRequestFullscreen) {
                mapContainer.webkitRequestFullscreen();
            } else if (mapContainer.msRequestFullscreen) {
                mapContainer.msRequestFullscreen();
            }
            
            setTimeout(() => {
                if (presentationMap) {
                    presentationMap.invalidateSize();
                }
            }, 100);
        } catch (error) {
            logError('toggleMapFullscreen', error);
        }
    }
}

function goToRegionDetail(regionKey) {
    try {
        const slideIndex = regions.indexOf(regionKey) + 2; // +2 for welcome and map slides
        if (slideIndex >= 2) {
            showRegionSlide(slideIndex);
            updateActiveRegion(regionKey);
            closeMapPopups();
        }
    } catch (error) {
        logError('goToRegionDetail', error, { regionKey });
    }
}

function closeMapPopups() {
    if (presentationMap) {
        try {
            presentationMap.closePopup();
            presentationMap.eachLayer(function(layer) {
                if (layer.closePopup) {
                    layer.closePopup();
                }
                if (layer.closeTooltip) {
                    layer.closeTooltip();
                }
            });
        } catch (error) {
            logError('closeMapPopups', error);
        }
    }
}

// Presentation control functions
function resetPresentation() {
    try {
        showRegionSlide(0);
        document.querySelectorAll('.region-item').forEach(item => {
            item.classList.remove('active');
        });
        closeSectorModal();
        closeHelpModal();
        closeMapPopups();
        clearSearch();
        
        // Update control buttons
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.control-btn[onclick="resetPresentation()"]')?.classList.add('active');
        
    } catch (error) {
        logError('resetPresentation', error);
    }
}

function toggleFullscreen() {
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) {
                document.documentElement.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    } catch (error) {
        logError('toggleFullscreen', error);
    }
}

// Additional utility functions
function addCustomStyles() {
    const markerStyle = document.createElement('style');
    markerStyle.textContent = `
        @keyframes markerPulse {
            0% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 0 rgba(102, 126, 234, 0.7); }
            70% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 10px rgba(102, 126, 234, 0); }
            100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 0 rgba(102, 126, 234, 0); }
        }
        
        .custom-map-marker:hover {
            transform: scale(1.2) !important;
            z-index: 1000 !important;
        }
        
        .custom-map-tooltip {
            background: rgba(255, 255, 255, 0.95) !important;
            border: none !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
            padding: 8px 12px !important;
            font-size: 12px !important;
            color: #333 !important;
        }
        
        .leaflet-tooltip-top:before {
            border-top-color: rgba(255, 255, 255, 0.95) !important;
        }
        
        .leaflet-popup {
            z-index: 1002 !important;
        }
        
        .leaflet-popup-pane {
            z-index: 1002 !important;
        }
        
        .popup-btn {
            cursor: pointer !important;
            border: none !important;
            outline: none !important;
            user-select: none !important;
        }
    `;
    document.head.appendChild(markerStyle);
}

// Event listeners and initialization
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Add ARIA attributes to progress bar
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.setAttribute('role', 'progressbar');
            progressBar.setAttribute('aria-valuemin', '0');
            progressBar.setAttribute('aria-valuemax', '100');
            progressBar.setAttribute('aria-valuenow', '0');
        }

        // Add custom styles
        addCustomStyles();

        // Initialize presentation
        initializePresentation();
        
        // Add keyboard navigation
        document.addEventListener('keydown', handleKeyboardNavigation);
        
        // Add window resize handler for map
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (presentationMap) {
                    try {
                        presentationMap.invalidateSize();
                    } catch (error) {
                        logError('windowResize', error);
                    }
                }
            }, 250);
        });

        // Close modals when clicking outside
        document.getElementById('sectorModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'sectorModal') {
                closeSectorModal();
            }
        });

        document.getElementById('helpModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'helpModal') {
                closeHelpModal();
            }
        });

        // Handle fullscreen changes
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);

        function handleFullscreenChange() {
            setTimeout(() => {
                if (presentationMap) {
                    try {
                        presentationMap.invalidateSize();
                    } catch (error) {
                        logError('fullscreenChange', error);
                    }
                }
            }, 100);
        }

        // Add performance monitoring
        if (typeof PerformanceObserver !== 'undefined') {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'navigation') {
                        console.log('Page load performance:', {
                            domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                            loadComplete: entry.loadEventEnd - entry.loadEventStart
                        });
                    }
                }
            });
            observer.observe({ entryTypes: ['navigation'] });
        }

        console.log('Dashboard initialized successfully');
        
    } catch (error) {
        logError('DOMContentLoaded', error);
        hideLoadingOverlay();
        
        // Fallback error message
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc2626; margin-bottom: 20px;"></i>
                <h1 style="color: #1f2937; margin-bottom: 10px;">Gagal Memuat Dashboard</h1>
                <p style="color: #6b7280; margin-bottom: 20px;">Terjadi kesalahan saat memuat dashboard investasi NTB.</p>
                <button onclick="location.reload()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Muat Ulang Halaman
                </button>
            </div>
        `;
    }
});

// Export functions for global access
window.showSectorDetail = showSectorDetail;
window.closeSectorModal = closeSectorModal;
window.showHelpModal = showHelpModal;
window.closeHelpModal = closeHelpModal;
window.resetPresentation = resetPresentation;
window.showMapOverview = showMapOverview;
window.toggleFullscreen = toggleFullscreen;
window.nextSlide = nextSlide;
window.previousSlide = previousSlide;
window.clearSearch = clearSearch;
window.toggleSectorFilter = toggleSectorFilter;
window.resetMapView = resetMapView;
window.toggleMapFullscreen = toggleMapFullscreen;
window.goToRegionDetail = goToRegionDetail;
window.closeMapPopups = closeMapPopups;
window.retryMapLoad = retryMapLoad;

// Final initialization
console.log('Dashboard JavaScript loaded successfully');