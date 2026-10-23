import 'package:flutter/material.dart';

class CaboPalette {
  static const clay = Color(0xFFC4673A);
  static const gold = Color(0xFFC9A84C);
  static const ink = Color(0xFF231C16);
  static const background = Color(0xFF0D1117);
  static const warmWhite = Color(0xFFF5EDE0);
  static const teal = Color(0xFF1D6B6B);
}

ThemeData caboTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: CaboPalette.clay,
    brightness: brightness,
    primary: CaboPalette.clay,
    secondary: CaboPalette.gold,
    surface: dark ? const Color(0xFF171D24) : const Color(0xFFF8F6F2),
    onSurface: dark ? CaboPalette.warmWhite : CaboPalette.ink,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? CaboPalette.background : const Color(0xFFF5F0EA),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? CaboPalette.background : const Color(0xFFF5F0EA),
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 19, fontWeight: FontWeight.bold,
        color: dark ? CaboPalette.warmWhite : CaboPalette.ink),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13),
        side: BorderSide(color: scheme.outlineVariant)),
    ),
  );
}
