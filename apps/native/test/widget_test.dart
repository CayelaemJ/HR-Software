import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cabo_human_capital/main.dart';

void main() {
  testWidgets('CABO native app uses its own brand components', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CaboBrandHeader())));
    expect(find.text('CABO'), findsOneWidget);
    expect(find.text('HUMAN CAPITAL'), findsOneWidget);
  });
}
