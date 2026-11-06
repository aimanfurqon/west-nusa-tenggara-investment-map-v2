// Realisasi investasi NTB, Triwulan II (April–Juni) 2026.
// Sumber angka: rekap kabupaten/kota DPMPTSP. PMDN, PMA, dan UMK dalam rupiah.
const NRI_REGIONS = {
    "lombok-barat": {
        name: "Kabupaten Lombok Barat",
        short: "Lombok Barat",
        pmdn: 289593952282,
        pma: 38944465624,
        umk: 37085128385,
        total: 365623546291,
        tki: 560,
        tka: 8,
        proyek: 782
    },
    "lombok-tengah": {
        name: "Kabupaten Lombok Tengah",
        short: "Lombok Tengah",
        pmdn: 40216763109,
        pma: 576049587454,
        umk: 40008191243,
        total: 656274541806,
        tki: 1227,
        tka: 12,
        proyek: 2406
    },
    "lombok-timur": {
        name: "Kabupaten Lombok Timur",
        short: "Lombok Timur",
        pmdn: 24904327904,
        pma: 14608323941,
        umk: 10504462295,
        total: 50017114140,
        tki: 723,
        tka: 0,
        proyek: 396
    },
    "lombok-utara": {
        name: "Kabupaten Lombok Utara",
        short: "Lombok Utara",
        pmdn: 258843975417,
        pma: 143725276105,
        umk: 16234345245,
        total: 418803596767,
        tki: 1257,
        tka: 19,
        proyek: 914
    },
    "sumbawa": {
        name: "Kabupaten Sumbawa",
        short: "Sumbawa",
        pmdn: 225468024747,
        pma: 16240458155,
        umk: 15772000000,
        total: 257480482902,
        tki: 342,
        tka: 0,
        proyek: 388
    },
    "sumbawa-barat": {
        name: "Kabupaten Sumbawa Barat",
        short: "Sumbawa Barat",
        pmdn: 11122838882734,
        pma: 322083749991,
        umk: 281606028409,
        total: 11726528661134,
        tki: 2438,
        tka: 0,
        proyek: 505
    },
    dompu: {
        name: "Kabupaten Dompu",
        short: "Dompu",
        pmdn: 38725490848,
        pma: 1554644131080,
        umk: 13293529589,
        total: 1606663151517,
        tki: 73,
        tka: 0,
        proyek: 341
    },
    bima: {
        name: "Kabupaten Bima",
        short: "Kab. Bima",
        pmdn: 11997491121,
        pma: 5341464430,
        umk: 10819000000,
        total: 28157955551,
        tki: 51,
        tka: 7,
        proyek: 155
    },
    "kota-mataram": {
        name: "Kota Mataram",
        short: "Mataram",
        pmdn: 388060553759,
        pma: 72912897167,
        umk: 17327337730,
        total: 478300788656,
        tki: 2240,
        tka: 0,
        proyek: 1101
    },
    "kota-bima": {
        name: "Kota Bima",
        short: "Kota Bima",
        pmdn: 13648319845,
        pma: 7808850000,
        umk: 54027198925,
        total: 75484368770,
        tki: 347,
        tka: 0,
        proyek: 223
    }
};

const NRI_STOPS = [
    { value: 2.8e10, color: [186, 220, 214] },
    { value: 1e11, color: [140, 198, 188] },
    { value: 4.5e11, color: [86, 166, 156] },
    { value: 8e11, color: [36, 124, 116] },
    { value: 2e12, color: [16, 86, 82] },
    { value: 1.2e13, color: [6, 40, 38] }
];

let nriLayer = null;

function formatRupiah(value) {
    const amount = Number(value) || 0;
    const number = (scaled) => new Intl.NumberFormat("id-ID", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(scaled);

    if (amount >= 1e12) return `Rp ${number(amount / 1e12)} triliun`;
    if (amount >= 1e9) return `Rp ${number(amount / 1e9)} miliar`;
    if (amount >= 1e6) return `Rp ${number(amount / 1e6)} juta`;
    return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
}

function formatCount(value) {
    return new Intl.NumberFormat("id-ID").format(value || 0);
}

function mixChannel(start, end, t) {
    return Math.round(start + (end - start) * t);
}

function colorForTotal(total) {
    const amount = Math.max(total, NRI_STOPS[0].value);
    const logValue = Math.log10(amount);
    let lower = NRI_STOPS[0];
    let upper = NRI_STOPS[NRI_STOPS.length - 1];

    for (let i = 0; i < NRI_STOPS.length - 1; i += 1) {
        if (logValue <= Math.log10(NRI_STOPS[i + 1].value)) {
            lower = NRI_STOPS[i];
            upper = NRI_STOPS[i + 1];
            break;
        }
    }

    const span = Math.log10(upper.value) - Math.log10(lower.value) || 1;
    const t = Math.min(1, Math.max(0, (logValue - Math.log10(lower.value)) / span));
    const [r, g, b] = [0, 1, 2].map((channel) => mixChannel(lower.color[channel], upper.color[channel], t));
    return `rgb(${r}, ${g}, ${b})`;
}

function nriTotals() {
    return Object.values(NRI_REGIONS).reduce((sum, region) => {
        sum.pmdn += region.pmdn;
        sum.pma += region.pma;
        sum.umk += region.umk;
        sum.total += region.total;
        sum.tki += region.tki;
        sum.tka += region.tka;
        sum.proyek += region.proyek;
        return sum;
    }, { pmdn: 0, pma: 0, umk: 0, total: 0, tki: 0, tka: 0, proyek: 0 });
}

function popupHtml(region) {
    return `
        <article class="nri-popup">
            <p class="nri-kicker">Triwulan II 2026</p>
            <h3>${region.name}</h3>
            <p class="nri-total">${formatRupiah(region.total)}</p>
            <p class="nri-total-label">Total realisasi</p>
            <dl class="nri-rows">
                <div class="nri-row"><dt>PMDN</dt><dd>${formatRupiah(region.pmdn)}</dd></div>
                <div class="nri-row"><dt>PMA</dt><dd>${formatRupiah(region.pma)}</dd></div>
                <div class="nri-row"><dt>UMK</dt><dd>${formatRupiah(region.umk)}</dd></div>
            </dl>
            <div class="nri-chips">
                <div class="nri-chip"><b>${formatCount(region.tki)}</b><span>TKI</span></div>
                <div class="nri-chip"><b>${formatCount(region.tka)}</b><span>TKA</span></div>
                <div class="nri-chip"><b>${formatCount(region.proyek)}</b><span>Proyek</span></div>
            </div>
        </article>
    `;
}

function ringContains(ring, lng, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const crosses = (yi > lat) !== (yj > lat);
        if (crosses && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function ringArea(ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    return Math.abs(area);
}

function largestPolygon(geometry) {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return polygons.reduce((best, polygon) => (ringArea(polygon[0]) > ringArea(best[0]) ? polygon : best));
}

function interiorPoint(geometry) {
    const polygon = largestPolygon(geometry);
    const ring = polygon[0];
    const lngs = ring.map((pair) => pair[0]);
    const lats = ring.map((pair) => pair[1]);
    const minX = Math.min(...lngs);
    const maxX = Math.max(...lngs);
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const centerLng = (minX + maxX) / 2;
    const centerLat = (minY + maxY) / 2;

    const contains = (lng, lat) => {
        if (!ringContains(ring, lng, lat)) return false;
        return !polygon.slice(1).some((hole) => ringContains(hole, lng, lat));
    };

    if (contains(centerLng, centerLat)) return [centerLat, centerLng];

    let best = null;
    let bestDistance = Infinity;
    const steps = 18;
    for (let row = 0; row <= steps; row += 1) {
        for (let column = 0; column <= steps; column += 1) {
            const lng = minX + ((maxX - minX) * column) / steps;
            const lat = minY + ((maxY - minY) * row) / steps;
            if (!contains(lng, lat)) continue;
            const distance = (lng - centerLng) ** 2 + (lat - centerLat) ** 2;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = [lat, lng];
            }
        }
    }

    if (best) return best;
    const totals = ring.reduce((sum, pair) => ({ lng: sum.lng + pair[0], lat: sum.lat + pair[1] }), { lng: 0, lat: 0 });
    return [totals.lat / ring.length, totals.lng / ring.length];
}

function renderNriChrome() {
    const totals = nriTotals();
    const summary = document.getElementById("nriSummary");
    const legend = document.getElementById("nriLegend");

    if (summary) {
        summary.innerHTML = `
            <p class="nri-kicker">DPMPTSP · Nusa Tenggara Barat</p>
            <h2>Realisasi investasi</h2>
            <p class="nri-period">Triwulan II 2026 · April–Juni</p>
            <p class="nri-hero">${formatRupiah(totals.total)}</p>
            <p class="nri-split">PMDN ${formatRupiah(totals.pmdn)}<br>PMA ${formatRupiah(totals.pma)}<br>UMK ${formatRupiah(totals.umk)}</p>
        `;
    }

    if (legend) {
        legend.innerHTML = `
            <p class="nri-kicker">Total realisasi</p>
            <div class="nri-scale" aria-hidden="true"></div>
            <div class="nri-scale-labels">
                <span>Kab. Bima<br>Rp 28 miliar</span>
                <span>Sumbawa Barat<br>Rp 11,73 triliun</span>
            </div>
        `;
    }
}

async function renderInvestmentChoropleth(map) {
    const response = await fetch("data/ntb.geojson");
    if (!response.ok) {
        throw new Error("Gagal memuat batas wilayah");
    }
    const geojson = await response.json();
    renderNriChrome();

    nriLayer = L.geoJSON(geojson, {
        style(feature) {
            const region = NRI_REGIONS[feature.properties.id];
            return {
                color: "#0e3c3a",
                weight: 1.25,
                opacity: 0.75,
                fillColor: region ? colorForTotal(region.total) : "#d5e0e0",
                fillOpacity: 0.9
            };
        },
        onEachFeature(feature, layer) {
            const region = NRI_REGIONS[feature.properties.id];
            if (!region) return;

            layer.bindPopup(popupHtml(region), {
                className: "nri-popup-wrap",
                closeButton: true,
                autoPan: true,
                maxWidth: 320,
                minWidth: 280
            });

            layer.on({
                mouseover() {
                    layer.setStyle({ weight: 2.4, opacity: 1, fillOpacity: 0.96 });
                    layer.bringToFront();
                },
                mouseout() {
                    nriLayer.resetStyle(layer);
                    ["kota-mataram", "kota-bima"].forEach((id) => {
                        const city = nriLayer.getLayers().find((item) => item.feature?.properties?.id === id);
                        if (city) city.bringToFront();
                    });
                }
            });

            const label = L.marker(interiorPoint(feature.geometry), {
                interactive: false,
                keyboard: false,
                icon: L.divIcon({
                    className: "nri-label-icon",
                    html: `<span class="nri-label">${region.short}</span>`,
                    iconSize: [132, 24],
                    iconAnchor: [66, 12]
                })
            });
            label.addTo(map);
        }
    }).addTo(map);

    nriLayer.getLayers().forEach((layer) => {
        const id = layer.feature?.properties?.id;
        if (id === "kota-mataram" || id === "kota-bima") layer.bringToFront();
    });

    fitNriMap();
}

function fitNriMap() {
    if (!presentationMap || !nriLayer) return;
    presentationMap.fitBounds(nriLayer.getBounds(), {
        paddingTopLeft: [28, 150],
        paddingBottomRight: [28, 92],
        animate: false
    });
}

window.renderInvestmentChoropleth = renderInvestmentChoropleth;
window.fitNriMap = fitNriMap;
window.formatRupiah = formatRupiah;
