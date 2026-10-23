import 'package:cabo_human_capital/theme.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('CABO palette reflects the approved identity', () {
    expect(CaboPalette.clay.toARGB32(), 0xFFC4673A);
    expect(CaboPalette.gold.toARGB32(), 0xFFC9A84C);
    expect(CaboPalette.background.toARGB32(), 0xFF0D1117);
  });
  test('light and dark theme initialize', () {
    expect(caboTheme, isNotNull);
  });
}
