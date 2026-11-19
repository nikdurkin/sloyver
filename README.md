# Слойвер Desktop

Слойвер помогает подготовить деталь к FDM-печати. Откройте модель STL, OBJ, 3MF или STEP, сравните ориентации, задайте нагрузки и оцените расход материала и стоимость печати. Выбранную ориентацию и параметры можно передать в слайсер через проект 3MF.

## Запуск готовой версии

Скачайте `Sloyver.exe` из [релизов для Windows x64](https://github.com/nikdurkin/sloyver/releases). Это переносная версия. Для запуска достаточно открыть EXE. Устанавливать Node.js не требуется.

## Сборка из исходников на Windows x64

Понадобятся Git и Node.js **22.12.0 или новее** с npm. При первой сборке нужен интернет для загрузки зависимостей, Electron и инструментов упаковки. Команды ниже выполняются в PowerShell.

### 1. Получите исходники

```powershell
git clone https://github.com/nikdurkin/sloyver.git
cd sloyver
```

### 2. Подготовьте модуль для импорта STEP

Загрузите WebAssembly-модуль Open CASCADE из закреплённой версии проекта occt-import-js. Контрольная сумма соответствует модулю из дистрибутива Слойвер 1.8.0.

```powershell
$wasm = 'renderer/vendor/occt/occt-import-js.wasm'
$url = 'https://raw.githubusercontent.com/kovacsv/occt-import-js/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/dist/occt-import-js.wasm'
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$wasm.download" -ErrorAction Stop
$expected = '33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$wasm.download").Hash -ne $expected) {
    throw 'Контрольная сумма модуля STEP не совпала. Повторите загрузку.'
}
Move-Item -Force -LiteralPath "$wasm.download" -Destination $wasm
```

### 3. Установите зависимости и запустите тесты

```powershell
npm ci
npm test
```

Для запуска приложения в режиме разработки выполните `npm start`.

### 4. Соберите приложение

| Вариант для Windows x64 | Команда | Результат для версии 1.8.0 |
| --- | --- | --- |
| Переносная версия | `npm run build:win` | `release/Sloyver-Desktop-1.8.0-Windows-x64.exe` |
| Установщик NSIS | `npm run build:installer` | `release/Sloyver-Setup-1.8.0-Windows-x64.exe` |

## Руководства

[Руководство на русском](README-RU.html) · [English manual](README-EN.html) · [Уведомления о сторонних компонентах](THIRD-PARTY-NOTICES.txt).
