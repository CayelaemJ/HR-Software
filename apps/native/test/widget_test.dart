import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cabo_human_capital/main.dart';
import 'package:cabo_human_capital/api.dart';

void main() {
  testWidgets('CABO native app uses its own brand components', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CaboBrandHeader())));
    expect(find.text('CABO'), findsOneWidget);
    expect(find.text('HUMAN CAPITAL'), findsOneWidget);
  });
  testWidgets('native leave dialog shows date fields and human approval notice', (tester) async {
    final api=CaboApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:LeaveDialog(api:api,onSubmitted:(){}))));
    expect(find.text('Leave type'),findsOneWidget);
    expect(find.text('Start date'),findsOneWidget);
    expect(find.text('End date'),findsOneWidget);
    expect(find.textContaining('HR must approve or reject'),findsOneWidget);
  });
}
