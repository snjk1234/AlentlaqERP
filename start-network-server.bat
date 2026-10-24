@echo off
title نظام المبيعات - خادم الشبكة الداخلية
color 0A
chcp 65001 > nul

echo.
echo  =====================================================
echo      الانطلاق - نظام المبيعات
echo      تشغيل خادم الشبكة الداخلية
echo  =====================================================
echo.

:: Check if Node.js is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [خطأ] Node.js غير مثبت على هذا الجهاز!
    echo  يرجى تثبيت Node.js من: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if .next folder exists (build output)
if not exist ".next" (
    color 0C
    echo  [خطأ] لم يتم إيجاد ملفات البناء!
    echo  يرجى تشغيل: npm run build
    echo.
    pause
    exit /b 1
)

echo  جاري تشغيل الخادم...
echo.

:: Get the machine's IP address
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%i
)
:: Remove leading space from IP
set IP=%IP: =%

echo  =====================================================
echo.
echo  تم تشغيل النظام بنجاح!
echo.
echo  للوصول من هذا الجهاز (الجهاز الرئيسي):
echo  http://localhost:3000
echo.
echo  للوصول من الأجهزة الأخرى (مثل Windows 7):
echo  http://%IP%:3000
echo.
echo  =====================================================
echo.
echo  [مهم: أبق هذه النافذة مفتوحة طوال فترة العمل]
echo  [لإيقاف الخادم: أغلق هذه النافذة أو اضغط Ctrl+C]
echo.

:: Start the Next.js production server (in foreground so window stays alive)
npx next start -p 3000 -H 0.0.0.0

pause
