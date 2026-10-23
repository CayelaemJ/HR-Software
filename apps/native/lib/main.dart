import 'package:flutter/material.dart';
import 'api.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CaboApp());
}

const clay = Color(0xFFC4673A);
const gold = Color(0xFFC9A84C);
const ink = Color(0xFF0D1117);
const warmWhite = Color(0xFFF5EDE0);

class CaboBrandHeader extends StatelessWidget {
  const CaboBrandHeader({super.key});
  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('CABO', style: TextStyle(color: clay, fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: 3)),
      Text('HUMAN CAPITAL', style: TextStyle(color: gold, fontSize: 11, letterSpacing: 3)),
    ],
  );
}

class CaboApp extends StatefulWidget {
  const CaboApp({super.key});
  @override
  State<CaboApp> createState() => _CaboAppState();
}

class _CaboAppState extends State<CaboApp> {
  final api = CaboApi();
  bool? signedIn;

  @override
  void initState() {
    super.initState();
    api.account().then((_) { if (mounted) setState(() => signedIn = true); })
      .catchError((Object _) { if (mounted) setState(() => signedIn = false); });
  }

  @override
  void dispose() {
    api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CABO Human Capital',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: ink,
      colorScheme: ColorScheme.fromSeed(seedColor: clay, brightness: Brightness.dark),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    ),
    home: signedIn == null
      ? const Scaffold(body: Center(child: CircularProgressIndicator()))
      : signedIn!
        ? EmployeeHome(api: api, onLogout: () => setState(() => signedIn = false))
        : SignIn(api: api, onSuccess: () => setState(() => signedIn = true)),
  );
}

class SignIn extends StatefulWidget {
  const SignIn({required this.api, required this.onSuccess, super.key});
  final CaboApi api;
  final VoidCallback onSuccess;
  @override
  State<SignIn> createState() => _SignInState();
}

class _SignInState extends State<SignIn> {
  final email = TextEditingController();
  final password = TextEditingController();
  final otp = TextEditingController();
  String? error;
  bool busy = false;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    otp.dispose();
    super.dispose();
  }
  Future<void> submit() async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.login(email.text.trim(), password.text, otpCode: otp.text.trim());
      if (mounted) widget.onSuccess();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420),
        child: AutofillGroup(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const CaboBrandHeader(),
          const SizedBox(height: 28),
          Text('Sign in to your workspace', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 20),
          TextField(controller: email, keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Work email')),
          const SizedBox(height: 14),
          TextField(controller: password, obscureText: true,
            autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: 14),
          TextField(controller: otp, keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'MFA code (if enabled)')),
          if (error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 14),
            child: Text(error!, style: const TextStyle(color: Colors.orangeAccent))),
          const SizedBox(height: 22),
          FilledButton(onPressed: busy ? null : submit,
            child: Text(busy ? 'Signing in…' : 'Sign in')),
          const SizedBox(height: 16),
          const Text('Your employer must first give you access to an organization account.',
            textAlign: TextAlign.center, style: TextStyle(color: warmWhite)),
        ]))),
    )),
  );
}

class EmployeeHome extends StatefulWidget {
  const EmployeeHome({required this.api, required this.onLogout, super.key});
  final CaboApi api;
  final VoidCallback onLogout;
  @override
  State<EmployeeHome> createState() => _EmployeeHomeState();
}

class _EmployeeHomeState extends State<EmployeeHome> {
  late Future<Map<String, dynamic>> profile = widget.api.employee();
  void refresh() => setState(() => profile = widget.api.employee());

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CaboBrandHeader(), actions: [
      IconButton(tooltip: 'Refresh', onPressed: refresh, icon: const Icon(Icons.refresh)),
      IconButton(tooltip: 'Sign out', onPressed: () async {
        try { await widget.api.logout(); } finally { if (mounted) widget.onLogout(); }
      }, icon: const Icon(Icons.logout)),
    ]),
    body: FutureBuilder<Map<String, dynamic>>(future: profile, builder: (context, snapshot) {
      if (!snapshot.hasData) {
        if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24),
          child: Text('Unable to load employee records. ' + snapshot.error.toString())));
        return const Center(child: CircularProgressIndicator());
      }
      final record = snapshot.data!;
      if (record['linked'] != true) return const Center(child: Padding(
        padding: EdgeInsets.all(24), child: Text('Your account is not linked to an employee record. Ask HR to connect your profile.')));
      final employee = Map<String, dynamic>.from(record['employee'] as Map);
      final reviews = (record['reviews'] as List? ?? []).cast<Map>();
      final cases = (record['cases'] as List? ?? []).cast<Map>();
      final plans = (record['plans'] as List? ?? []).cast<Map>();
      return LayoutBuilder(builder: (context, constraints) => Center(
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: constraints.maxWidth > 850 ? 840 : 600),
          child: ListView(padding: const EdgeInsets.all(22), children: [
            Text(employee['full_name']?.toString() ?? 'My employment', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text((employee['job_title'] ?? '').toString() + ' · ' + (employee['department'] ?? '').toString()),
            const SizedBox(height: 24),
            FilledButton.icon(onPressed: () => showDialog<void>(context: context, builder: (_) =>
              ProgressionDialog(api: widget.api, onSubmitted: refresh)), icon: const Icon(Icons.trending_up),
              label: const Text('Request independent career review')),
            const SizedBox(height: 22),
            Text('My review requests', style: Theme.of(context).textTheme.titleLarge),
            ...cases.map((e) => Card(child: ListTile(title: Text((e['kind'] ?? '').toString().replaceAll('_', ' ')),
              subtitle: Text((e['requested_outcome'] ?? '').toString()),
              trailing: Text((e['status'] ?? '').toString())))),
            const SizedBox(height: 20),
            Text('Finalized performance reviews', style: Theme.of(context).textTheme.titleLarge),
            ...reviews.map((e) => Card(child: ListTile(title: Text((e['period_label'] ?? '').toString()),
              subtitle: Text((e['summary'] ?? '').toString())))),
            const SizedBox(height: 20),
            Text('Development plans', style: Theme.of(context).textTheme.titleLarge),
            ...plans.map((e) => Card(child: ListTile(title: Text((e['goal'] ?? '').toString()),
              subtitle: Text((e['status'] ?? '').toString())))),
          ])),
        ),
      ));
    }),
  );
}

class ProgressionDialog extends StatefulWidget {
  const ProgressionDialog({required this.api, required this.onSubmitted, super.key});
  final CaboApi api;
  final VoidCallback onSubmitted;
  @override
  State<ProgressionDialog> createState() => _ProgressionDialogState();
}
class _ProgressionDialogState extends State<ProgressionDialog> {
  final evidence = TextEditingController();
  final outcome = TextEditingController();
  String kind = 'career_development';
  String? error;
  bool busy = false;
  @override
  void dispose() { evidence.dispose(); outcome.dispose(); super.dispose(); }
  Future<void> submit() async {
    if (evidence.text.trim().length < 20 || outcome.text.trim().length < 10) {
      setState(() => error = 'Provide specific evidence and your requested outcome.');
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      await widget.api.requestProgression(kind, evidence.text.trim(), outcome.text.trim());
      if (mounted) { Navigator.of(context).pop(); widget.onSubmitted(); }
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Career review request'),
    content: SizedBox(width: 450, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      DropdownButtonFormField<String>(initialValue: kind,
        items: const [
          DropdownMenuItem(value: 'promotion', child: Text('Promotion')),
          DropdownMenuItem(value: 'salary_review', child: Text('Salary review')),
          DropdownMenuItem(value: 'career_development', child: Text('Career development')),
          DropdownMenuItem(value: 'performance_appeal', child: Text('Performance appeal'))
        ],
        onChanged: busy ? null : (v) { if (v != null) setState(() => kind = v); }),
      const SizedBox(height: 12),
      TextField(controller: evidence, maxLines: 4, maxLength: 6000, decoration: const InputDecoration(labelText: 'Evidence and context')),
      const SizedBox(height: 12),
      TextField(controller: outcome, maxLines: 2, maxLength: 2000, decoration: const InputDecoration(labelText: 'Requested outcome')),
      if (error != null) Text(error!, style: const TextStyle(color: Colors.orangeAccent)),
      const SizedBox(height: 12),
      const Text('Only an authorized human reviewer can decide the outcome.'),
    ]))),
    actions: [TextButton(onPressed: busy ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
      FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Submitting…' : 'Submit'))],
  );
}
