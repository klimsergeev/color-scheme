// ============================================
// Price Color Mapper - Алгоритм раскраски цен
// ============================================

const DEFAULT_THRESHOLDS = {
  veryLow: 500,
  low: 1500,
  medium: 3500,
  high: 7000,
  veryHigh: 15000,
};

class PriceColorMapper {
  constructor(options = {}) {
    this.options = {
      absoluteThresholds: options.absoluteThresholds ?? DEFAULT_THRESHOLDS,
      useLogScale: options.useLogScale ?? true,
      minPricesForStats: options.minPricesForStats ?? 5,
    };
  }

  mapPricesToColors(prices) {
    if (prices.length === 0) return [];

    const transformedPrices = this.options.useLogScale
      ? prices.map(p => Math.log1p(p))
      : prices;

    const stats = this.calculateStatistics(transformedPrices);
    const normalizedValues = this.normalizeWithDistribution(
      transformedPrices, prices, stats
    );

    return prices.map((price, i) => {
      const normalized = normalizedValues[i];
      const hsl = this.valueToHSL(normalized);
      const rgb = this.hslToRgb(hsl);

      return {
        price,
        color: this.rgbToHex(rgb),
        colorRGB: rgb,
        colorHSL: hsl,
        normalizedValue: normalized,
        percentile: this.calculatePercentile(transformedPrices[i], transformedPrices),
      };
    });
  }

  calculateStatistics(values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const sorted = [...values].sort((a, b) => a - b);

    return {
      mean, stdDev,
      min: sorted[0],
      max: sorted[n - 1],
      median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)],
      q1: sorted[Math.floor(n * 0.25)],
      q3: sorted[Math.floor(n * 0.75)],
      iqr: sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)],
      n
    };
  }

  normalizeWithDistribution(transformedPrices, originalPrices, stats) {
    if (stats.n < this.options.minPricesForStats) {
      return originalPrices.map(price => this.normalizeByAbsoluteThresholds(price));
    }

    return transformedPrices.map((transformed, i) => {
      const original = originalPrices[i];
      const zScore = stats.stdDev > 0 ? (transformed - stats.mean) / stats.stdDev : 0;
      const relativeProbability = this.normalCDF(zScore);
      const absolutePosition = this.normalizeByAbsoluteThresholds(original);
      const absoluteWeight = Math.max(0.2, 1 - (stats.n - this.options.minPricesForStats) / 20);
      const combined = relativeProbability * (1 - absoluteWeight) + absolutePosition * absoluteWeight;
      return Math.max(0, Math.min(1, combined));
    });
  }

  normalizeByAbsoluteThresholds(price) {
    const t = this.options.absoluteThresholds;
    const thresholdPoints = [
      { price: 0, value: 0 },
      { price: t.veryLow, value: 0.1 },
      { price: t.low, value: 0.25 },
      { price: t.medium, value: 0.5 },
      { price: t.high, value: 0.75 },
      { price: t.veryHigh, value: 0.9 },
    ];

    for (let i = 0; i < thresholdPoints.length - 1; i++) {
      const curr = thresholdPoints[i];
      const next = thresholdPoints[i + 1];
      if (price <= next.price) {
        const t = (price - curr.price) / (next.price - curr.price);
        const smooth = t * t * (3 - 2 * t);
        return curr.value + (next.value - curr.value) * smooth;
      }
    }
    const excess = price / t.veryHigh;
    return 0.9 + 0.1 * (1 - 1 / excess);
  }

  normalCDF(z) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1.0 + sign * y);
  }

  valueToHSL(value) {
    const hue = this.interpolateHue(value);
    const saturationBase = 45;
    const saturationBoost = 25 * Math.pow(Math.abs(value - 0.5) * 2, 0.7);
    const saturation = saturationBase + saturationBoost;
    const lightness = 53 - 5 * Math.pow(Math.abs(value - 0.5) * 2, 0.5);
    return { h: hue, s: saturation, l: lightness };
  }

  interpolateHue(t) {
    if (t <= 0) return 220;
    if (t >= 1) return 0;

    const hueStops = [
      { t: 0, h: 215 },
      { t: 0.1, h: 205 },
      { t: 0.2, h: 190 },
      { t: 0.28, h: 170 },
      { t: 0.35, h: 150 },
      { t: 0.42, h: 120 },
      { t: 0.5, h: 90 },
      { t: 0.58, h: 70 },
      { t: 0.65, h: 55 },
      { t: 0.72, h: 45 },
      { t: 0.8, h: 35 },
      { t: 0.9, h: 20 },
      { t: 1, h: 5 },
    ];

    for (let i = 0; i < hueStops.length - 1; i++) {
      if (t <= hueStops[i + 1].t) {
        const curr = hueStops[i];
        const next = hueStops[i + 1];
        const localT = (t - curr.t) / (next.t - curr.t);
        const smooth = localT * localT * (3 - 2 * localT);
        return curr.h + (next.h - curr.h) * smooth;
      }
    }

    return 0;
  }

  calculatePercentile(value, allValues) {
    const sorted = [...allValues].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    return index >= 0 ? (index / (sorted.length - 1 || 1)) * 100 : 100;
  }

  hslToRgb(hsl) {
    const h = hsl.h / 360, s = hsl.s / 100, l = hsl.l / 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  rgbToHex(rgb) {
    const toHex = c => c.toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }
}

// ============================================
// Hall Color Mapper - Раскраска схемы зала
// ============================================

class HallColorMapper {
  constructor(svgElement) {
    this.svg = svgElement;
    this.places = [];
    this.stageCenter = null;
    this.stageBottomY = null;
  }

  /**
   * Извлекает координаты из path d атрибута
   * Поддерживает форматы: "M764.444 64H331.3V..." или "M549.336 149.361C..."
   */
  extractCoordsFromPath(d) {
    // Ищем первую команду M (moveto) с координатами
    const match = d.match(/M\s*([\d.]+)\s+([\d.]+)/);
    if (match) {
      return {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      };
    }
    return null;
  }

  /**
   * Парсит SVG и извлекает все места с координатами
   * Поддерживает оба формата: rect и path с fill="#CACED2"
   */
  parsePlaces() {
    this.places = [];

    // Сначала ищем rect элементы (оптимизированный формат)
    const rects = this.svg.querySelectorAll('rect[fill="#CACED2"]');
    if (rects.length > 0) {
      rects.forEach((el, index) => {
        const x = parseFloat(el.getAttribute('x')) || 0;
        const y = parseFloat(el.getAttribute('y')) || 0;
        const width = parseFloat(el.getAttribute('width')) || 16;
        const height = parseFloat(el.getAttribute('height')) || 16;

        this.places.push({
          element: el,
          x: x + width / 2,
          y: y + height / 2,
          id: `place-${index}`,
        });
      });
    } else {
      // Fallback: ищем path элементы (старый формат)
      const paths = this.svg.querySelectorAll('path[fill="#CACED2"]');
      paths.forEach((el, index) => {
        const d = el.getAttribute('d');
        if (!d) return;

        const coords = this.extractCoordsFromPath(d);
        if (!coords) return;

        this.places.push({
          element: el,
          x: coords.x + 4,
          y: coords.y + 4,
          id: `place-${index}`,
        });
      });
    }

    console.log(`Найдено мест: ${this.places.length}`);
    return this.places;
  }

  /**
   * Определяет позицию сцены
   * Поддерживает rect и path с fill="#DCDFE2"
   */
  findStage() {
    const viewBox = this.svg.getAttribute('viewBox')?.split(' ') || [];
    const svgWidth = parseFloat(viewBox[2]) || parseFloat(this.svg.getAttribute('width')) || 1000;

    // Сначала ищем rect сцены (оптимизированный формат)
    const stageRect = this.svg.querySelector('rect[fill="#DCDFE2"]');
    if (stageRect) {
      const x = parseFloat(stageRect.getAttribute('x')) || 0;
      const y = parseFloat(stageRect.getAttribute('y')) || 0;
      const width = parseFloat(stageRect.getAttribute('width')) || 0;
      const height = parseFloat(stageRect.getAttribute('height')) || 0;

      this.stageCenter = {
        x: x + width / 2,
        y: y + height / 2
      };
      this.stageBottomY = y + height;

      console.log('Сцена (rect):', this.stageCenter, 'bottomY:', this.stageBottomY);
      return { center: this.stageCenter, bottomY: this.stageBottomY };
    }

    // Fallback: ищем path элементы (старый формат)
    const stagePaths = this.svg.querySelectorAll('path[fill="#DCDFE2"]');
    if (stagePaths.length >= 1) {
      const stagePath = stagePaths[stagePaths.length > 1 ? 1 : 0];
      const d = stagePath.getAttribute('d');
      const coords = this.extractCoordsFromPath(d);

      if (coords) {
        this.stageCenter = { x: svgWidth / 2, y: coords.y };
        this.stageBottomY = coords.y;

        console.log('Сцена (path):', this.stageCenter, 'bottomY:', this.stageBottomY);
        return { center: this.stageCenter, bottomY: this.stageBottomY };
      }
    }

    // Fallback: используем верхнюю часть SVG
    this.stageCenter = { x: svgWidth / 2, y: 50 };
    this.stageBottomY = 60;

    console.log('Сцена (fallback):', this.stageCenter, 'bottomY:', this.stageBottomY);
    return { center: this.stageCenter, bottomY: this.stageBottomY };
  }

  /**
   * Рассчитывает расстояние от места до нижнего края сцены
   */
  calculateDistance(place) {
    if (!this.stageCenter || this.stageBottomY === null) {
      this.findStage();
    }

    // Евклидово расстояние от нижнего края сцены
    const dx = place.x - this.stageCenter.x;
    const dy = place.y - this.stageBottomY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Рассчитывает расстояния для всех мест
   */
  calculateAllDistances() {
    if (this.places.length === 0) {
      this.parsePlaces();
    }

    this.places.forEach(place => {
      place.distance = this.calculateDistance(place);
    });

    // Сортируем для квантильного распределения
    const sortedByDistance = [...this.places].sort((a, b) => a.distance - b.distance);

    // Присваиваем квантильный ранг
    sortedByDistance.forEach((place, index) => {
      place.quantileRank = index / (sortedByDistance.length - 1 || 1);
    });

    return this.places;
  }

  /**
   * Раскрашивает схему по ценам
   * @param {Array} priceColors - массив объектов {price, color} от PriceColorMapper
   */
  colorizeByPrices(priceColors) {
    if (this.places.length === 0 || this.places[0].quantileRank === undefined) {
      this.calculateAllDistances();
    }

    if (priceColors.length === 0) return;

    // Сортируем цены по возрастанию (дешёвые = дальние от сцены)
    const sortedColors = [...priceColors].sort((a, b) => a.price - b.price);
    const numZones = sortedColors.length;

    this.places.forEach(place => {
      // quantileRank = 0 (близко к сцене) → дорогой цвет (конец массива)
      // quantileRank = 1 (далеко от сцены) → дешёвый цвет (начало массива)
      let zoneIndex = Math.round((1 - place.quantileRank) * (numZones - 1));
      zoneIndex = Math.max(0, Math.min(numZones - 1, zoneIndex));

      const colorData = sortedColors[zoneIndex];
      place.element.setAttribute('fill', colorData.color);
      place.assignedPrice = colorData.price;
      place.assignedColor = colorData.color;
    });
  }

  /**
   * Сбрасывает цвета на дефолтные
   */
  resetColors() {
    this.places.forEach(place => {
      place.element.setAttribute('fill', '#CACED2');
    });
  }
}

// ============================================
// Приложение
// ============================================

// Глобальные переменные
let currentPrices = [];
let mapper = new PriceColorMapper();
let hallMapper = null;

const presets = {
  default: [300, 500, 800, 1200, 1800, 2500, 3500, 5000, 7000, 10000, 15000, 20000],
  concerts: [1500, 2500, 3500, 5000, 7500, 10000, 15000, 25000],
  theater: [500, 800, 1200, 2000, 3000, 5000, 8000],
  festivals: [2000, 3500, 5000, 7000, 10000, 15000, 25000, 35000],
  random: Array.from({ length: 15 }, () => Math.floor(Math.random() * 15000) + 300)
};

function renderPrices(containerId, prices) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const results = mapper.mapPricesToColors(prices);

  container.innerHTML = results.map(r => `
    <div class="price-card" style="background-color: ${r.color}">
      <div class="price-value">${r.price.toLocaleString('ru-RU')} ₽</div>
      <div class="price-meta">
        ${r.color}<br>
        norm: ${r.normalizedValue.toFixed(2)}
      </div>
    </div>
  `).join('');

  // Обновляем превью схемы зала
  updateHallPreview(prices);
}

function renderSpectrum() {
  const container = document.getElementById('spectrum');
  if (!container) return;

  const steps = 20;
  const prices = Array.from({ length: steps }, (_, i) => 100 + i * 25000);
  const results = mapper.mapPricesToColors(prices);

  container.innerHTML = results.map(r => `
    <div class="spectrum-segment" style="background-color: ${r.color}">
      ${(r.price / 1000).toFixed(0)}k
    </div>
  `).join('');
}

/**
 * Загружает SVG схемы зала
 * @param {string} svgPath - путь к SVG файлу
 */
async function loadHallSvg(svgPath = '../halls/medium-optimized.svg') {
  const container = document.getElementById('hallPreview');
  if (!container) return;

  try {
    const response = await fetch(svgPath);
    const svgText = await response.text();
    container.innerHTML = svgText;

    const svgElement = container.querySelector('svg');
    if (svgElement) {
      // Получаем оригинальные размеры
      const origWidth = parseFloat(svgElement.getAttribute('width')) || 2004;
      const origHeight = parseFloat(svgElement.getAttribute('height')) || 1252;

      // Устанавливаем viewBox для корректного масштабирования
      if (!svgElement.getAttribute('viewBox')) {
        svgElement.setAttribute('viewBox', `0 0 ${origWidth} ${origHeight}`);
      }

      // Адаптируем размер SVG
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svgElement.style.maxHeight = '500px';
      svgElement.style.display = 'block';

      hallMapper = new HallColorMapper(svgElement);
      hallMapper.parsePlaces();
      hallMapper.findStage();
      hallMapper.calculateAllDistances();

      // Применяем текущие цены
      if (currentPrices.length > 0) {
        updateHallPreview(currentPrices);
      }
    }
  } catch (error) {
    console.error('Ошибка загрузки схемы зала:', error);
    container.innerHTML = '<p style="color: #999;">Не удалось загрузить схему зала</p>';
  }
}

/**
 * Обновляет превью схемы зала
 */
function updateHallPreview(prices) {
  if (!hallMapper || prices.length === 0) return;

  const priceColors = mapper.mapPricesToColors(prices);
  hallMapper.colorizeByPrices(priceColors);
}

// Глобальные функции для HTML
window.addCustomPrice = function() {
  const input = document.getElementById('customPrice');
  const price = parseFloat(input.value);
  if (!isNaN(price) && price > 0) {
    currentPrices.push(price);
    currentPrices.sort((a, b) => a - b);
    renderPrices('pricesGrid', currentPrices);
    input.value = '';
  }
};

window.clearPrices = function() {
  currentPrices = [];
  document.getElementById('pricesGrid').innerHTML = '';
  if (hallMapper) {
    hallMapper.resetColors();
  }
};

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  // Инициализация preset селектора
  const presetSelect = document.getElementById('preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      currentPrices = [...presets[e.target.value]].sort((a, b) => a - b);
      renderPrices('pricesGrid', currentPrices);
    });
  }

  // Инициализация селектора схемы зала
  const hallSelect = document.getElementById('hallSelect');
  if (hallSelect) {
    hallSelect.addEventListener('change', (e) => {
      loadHallSvg(e.target.value);
    });
  }

  // Инициализация
  currentPrices = [...presets.default];
  renderSpectrum();
  renderPrices('pricesGrid', currentPrices);

  // Загружаем схему зала (по умолчанию средняя)
  const defaultHall = hallSelect?.value || '../halls/medium-optimized.svg';
  loadHallSvg(defaultHall);
});
