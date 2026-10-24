@echo off
title فتح منفذ الشبكة للنظام
color 0A
chcp 65001 > nul

echo.
echo  جاري فتح منفذ الشبكة (Port 3000)...
echo  يجب تشغيل هذا الملف كـ Administrator مرة واحدة فقط
echo.

netsh advfirewall firewall add rule name="AlEntlaq POS Server" dir=in action=allow protocol=TCP localport=3000

if %errorlevel% equ 0 (
    color 0A
    echo  تم فتح المنفذ بنجاح!
    echo  يمكنك الآن تشغيل ملف: start-network-server.bat
) else (
    color 0C
    echo  فشل فتح المنفذ. تأكد من تشغيل هذا الملف كـ Administrator
    echo  (كليك يمين على الملف ثم اختر: Run as administrator)
)

echo.
pause
