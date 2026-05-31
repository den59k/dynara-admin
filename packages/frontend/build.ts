import vuePlugin from "../plugins/vue-plugin.ts"; // Ваш плагин
import svgPlugin from "../plugins/svg-plugin.ts"; // Ваш плагин

const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  plugins: [ vuePlugin, svgPlugin ], // Подключаем плагины здесь
});

if (!result.success) {
  console.error("Сборка завершилась ошибкой:", result.logs);
} else {
  console.log("Проект успешно собран!");
}
