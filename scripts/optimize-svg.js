/**
 * Скрипт оптимизации SVG схем залов
 * Убирает лишние элементы, сохраняя совместимость с HallColorMapper
 */

const fs = require('fs');
const path = require('path');

function optimizeSvg(inputPath, outputPath) {
  let svg = fs.readFileSync(inputPath, 'utf8');

  // 1. Извлекаем все rect места
  const placeRegex = /<rect[^>]*class="place[^"]*"[^>]*>/g;
  const places = svg.match(placeRegex) || [];
  console.log(`Найдено мест: ${places.length}`);

  // 2. Извлекаем сцену (rect или ellipse с fill="#e2e6ea" или rgb(220, 223, 226))
  let stageData = null;

  // Вариант 1: rect с fill="#e2e6ea" внутри группы с transform
  const stageGroupMatch1 = svg.match(/<g[^>]*id="stage"[^>]*transform="translate\(([^,]+),\s*([^)]+)\)[^"]*"[^>]*>[\s\S]*?<rect[^>]*fill="#e2e6ea"[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*>/i);

  if (stageGroupMatch1) {
    const tx = parseFloat(stageGroupMatch1[1]);
    const ty = parseFloat(stageGroupMatch1[2]);
    const sx = parseFloat(stageGroupMatch1[3]);
    const sy = parseFloat(stageGroupMatch1[4]);
    const sw = parseFloat(stageGroupMatch1[5]);
    const sh = parseFloat(stageGroupMatch1[6]);
    stageData = { x: tx + sx, y: ty + sy, width: sw, height: sh };
  }

  // Вариант 2: rect с fill="rgb(220, 223, 226)" внутри группы с transform
  if (!stageData) {
    const stageGroupMatch2 = svg.match(/<g[^>]*class="rectangle"[^>]*transform="translate\(([^,]+),\s*([^)]+)\)[^"]*"[^>]*>[\s\S]*?<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*fill="rgb\(220,\s*223,\s*226\)"[^>]*>/i);

    if (stageGroupMatch2) {
      const tx = parseFloat(stageGroupMatch2[1]);
      const ty = parseFloat(stageGroupMatch2[2]);
      const sx = parseFloat(stageGroupMatch2[3]);
      const sy = parseFloat(stageGroupMatch2[4]);
      const sw = parseFloat(stageGroupMatch2[5]);
      const sh = parseFloat(stageGroupMatch2[6]);
      stageData = { x: tx + sx, y: ty + sy, width: sw, height: sh };
    }
  }

  console.log(`Сцена найдена: ${!!stageData}`);

  // 3. Парсим координаты мест для определения границ
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  const optimizedPlaces = places.map(place => {
    const x = parseFloat(place.match(/x="([^"]+)"/)?.[1] || 0);
    const y = parseFloat(place.match(/y="([^"]+)"/)?.[1] || 0);
    const width = parseFloat(place.match(/width="([^"]+)"/)?.[1] || 16);
    const height = parseFloat(place.match(/height="([^"]+)"/)?.[1] || 16);
    const rx = place.match(/rx="([^"]+)"/)?.[1] || '6';

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + width);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + height);

    // Оптимизированный rect без лишних атрибутов
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="#CACED2"/>`;
  });

  // 4. Используем координаты сцены
  let stageRect = '';
  if (stageData) {
    minX = Math.min(minX, stageData.x);
    maxX = Math.max(maxX, stageData.x + stageData.width);
    minY = Math.min(minY, stageData.y);
    maxY = Math.max(maxY, stageData.y + stageData.height);

    stageRect = `<rect x="${stageData.x}" y="${stageData.y}" width="${stageData.width}" height="${stageData.height}" fill="#DCDFE2"/>`;
  }

  // 5. Добавляем padding
  const padding = 10;
  minX -= padding;
  minY -= padding;
  const width = maxX - minX + padding;
  const height = maxY - minY + padding;

  console.log(`Границы: x=${minX.toFixed(0)}, y=${minY.toFixed(0)}, w=${width.toFixed(0)}, h=${height.toFixed(0)}`);

  // 6. Корректируем координаты (сдвигаем к 0,0)
  const offsetX = -minX;
  const offsetY = -minY;

  const adjustedPlaces = optimizedPlaces.map(place => {
    return place.replace(/x="([^"]+)"/, (_, x) => `x="${(parseFloat(x) + offsetX).toFixed(0)}"`)
                .replace(/y="([^"]+)"/, (_, y) => `y="${(parseFloat(y) + offsetY).toFixed(0)}"`);
  });

  let adjustedStage = '';
  if (stageRect) {
    adjustedStage = stageRect
      .replace(/x="([^"]+)"/, (_, x) => `x="${(parseFloat(x) + offsetX).toFixed(0)}"`)
      .replace(/y="([^"]+)"/, (_, y) => `y="${(parseFloat(y) + offsetY).toFixed(0)}"`);
  }

  // 7. Собираем оптимизированный SVG
  const optimizedSvg = `<svg width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" fill="none" xmlns="http://www.w3.org/2000/svg">
${adjustedStage}
${adjustedPlaces.join('\n')}
</svg>`;

  // 8. Сохраняем
  fs.writeFileSync(outputPath, optimizedSvg);

  const originalSize = fs.statSync(inputPath).size;
  const optimizedSize = fs.statSync(outputPath).size;
  const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

  console.log(`\nРезультат:`);
  console.log(`  Оригинал: ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`  Оптимизированный: ${(optimizedSize / 1024).toFixed(1)} KB`);
  console.log(`  Экономия: ${savings}%`);
}

// Запуск
const input = process.argv[2] || 'halls/small-orig.svg';
const output = process.argv[3] || 'halls/small.svg';

console.log(`Оптимизация: ${input} -> ${output}\n`);
optimizeSvg(input, output);
