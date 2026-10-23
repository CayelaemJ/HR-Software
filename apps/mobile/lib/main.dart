import 'package:flutter/material.dart';
import 'api.dart';
import 'theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const apiUrl = String.fromEnvironment(
    'CABO_API_BASE_URL',
    defaultValue: 'https://cabo-human-capital.onrender.com',
  );
  final api = CaboApi(baseUri: Uri.parse(apiUrl));
  await api.restore();
  runApp(CaboApplication(api: api));
}

class CaboApplication extends StatefulWidget {
  final CaboApi api;
  const CaboApplication({super.key, required this.api});
  @override
  State<CaboApplication> createState() => _CaboApplicationState();
}

class _CaboApplicationState extends State<CaboApplication> {
  Map<String, dynamic>? profile;
  bool loading = true;
  bool dark = true;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      final data = await widget.api.profile();
      if (mounted) setState(() => profile = data);
    } catch (_) {
      await widget.api.clearLocal();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _signOut() async {
    await widget.api.signOut();
    if (mounted) setState(() => profile = null);
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'CABO Human Capital',
    debugShowCheckedModeBanner: false,
    theme: caboTheme(Brightness.light),
    darkTheme: caboTheme(Brightness.dark),
    themeMode: dark ? ThemeMode.dark : ThemeMode.light,
    home: loading
      ? const Scaffold(body: Center(child: CircularProgressIndicator()))
      : profile == null
        ? LoginScreen(api: widget.api, onSignedIn: (value) => setState(() => profile = value))
        : WorkspaceScreen(
            api: widget.api,
            profile: profile!,
            dark: dark,
            onToggleTheme: () => setState(() => dark = !dark),
            onSignOut: _signOut,
          ),
  );

  @override
  void dispose() {
    widget.api.dispose();
    super.dispose();
  }
}

class LoginScreen extends StatefulWidget {
  final CaboApi api;
  final ValueChanged<Map<String, dynamic>> onSignedIn;
  const LoginScreen({super.key, required this.api, required this.onSignedIn});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final form = GlobalKey<FormState>();
  final username = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  String? error;
  bool busy = false;

  Future<void> _signIn() async {
    if (!form.currentState!.validate() || busy) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.signIn(username.text, password.text, code.text);
      final data = await widget.api.profile();
      if (mounted) widget.onSignedIn(data);
    } on CaboApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } catch (_) {
      if (mounted) setState(() => error = 'Could not connect securely to CABO.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(body: SafeArea(child: Center(child: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 425),
        child: Form(key: form, child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: CircleAvatar(radius: 30,
              backgroundColor: CaboPalette.clay,
              child: Text('C.', style: TextStyle(fontSize: 24, color: Colors.white,
                fontWeight: FontWeight.w700)))),
            const SizedBox(height: 18),
            Text('CABO HUMAN CAPITAL', textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, letterSpacing: 2, color: colors.secondary)),
            const SizedBox(height: 22),
            Text('A better way to grow.', textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 12),
            const Text('Secure recruitment, people management and development.',
              textAlign: TextAlign.center),
            const SizedBox(height: 32),
            TextFormField(
              controller: username,
              autofillHints: const [AutofillHints.username],
              decoration: const InputDecoration(labelText: 'Email or username'),
              validator: (v) => v == null || v.trim().length < 3 ? 'Enter a username' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: password, obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Password'),
              validator: (v) => v == null || v.isEmpty ? 'Enter your password' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: code,
              onFieldSubmitted: (_) => _signIn(),
              decoration: const InputDecoration(
                labelText: 'Authenticator code (if enabled)',
                helperText: 'Six-digit or one-time recovery code',
              ),
            ),
            if (error != null) ...[
              const SizedBox(height: 12),
              Semantics(liveRegion: true,
                child: Text(error!, style: TextStyle(color: colors.error))),
            ],
            const SizedBox(height: 20),
            FilledButton(onPressed: busy ? null : _signIn,
              child: Padding(padding: const EdgeInsets.all(12),
                child: busy ? const CircularProgressIndicator.adaptive()
                  : const Text('Sign in securely'))),
            const SizedBox(height: 22),
            const Text('Private HR information is available only to authorized members.',
              textAlign: TextAlign.center),
          ],
        )),
      ),
    ))));
  }

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    code.dispose();
    super.dispose();
  }
}

class WorkspaceScreen extends StatefulWidget {
  final CaboApi api;
  final Map<String, dynamic> profile;
  final bool dark;
  final VoidCallback onToggleTheme;
  final Future<void> Function() onSignOut;
  const WorkspaceScreen({super.key, required this.api, required this.profile,
    required this.dark, required this.onToggleTheme, required this.onSignOut});
  @override
  State<WorkspaceScreen> createState() => _WorkspaceScreenState();
}

class _WorkspaceScreenState extends State<WorkspaceScreen> {
  int section = 0;
  static const destinations = <NavigationDestination>[
    NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Overview'),
    NavigationDestination(icon: Icon(Icons.work_outline), label: 'Vacancies'),
    NavigationDestination(icon: Icon(Icons.badge_outlined), label: 'My staff'),
    NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
  ];
  @override
  Widget build(BuildContext context) {
    final user = widget.profile['user'];
    final name = user is Map ? (user['name'] ?? user['full_name'] ?? user['email']).toString() : 'Member';
    final organization = widget.profile['organization']?.toString() ?? 'CABO Human Capital';
    final content = IndexedStack(index: section, children: [
      OverviewPanel(api: widget.api, name: name),
      JobsPanel(api: widget.api),
      StaffPanel(api: widget.api),
      AccountPanel(profile: widget.profile, onSignOut: widget.onSignOut),
    ]);
    return LayoutBuilder(builder: (context, constraints) {
      final desktop = constraints.maxWidth >= 820;
      return Scaffold(
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('CABO Human Capital'),
            Text(organization, style: Theme.of(context).textTheme.labelSmall),
          ]),
          actions: [IconButton(
            onPressed: widget.onToggleTheme,
            tooltip: widget.dark ? 'Light appearance' : 'Dark appearance',
            icon: Icon(widget.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
          )],
        ),
        body: SafeArea(child: desktop
          ? Row(children: [
              NavigationRail(
                selectedIndex: section,
                onDestinationSelected: (v) => setState(() => section = v),
                labelType: NavigationRailLabelType.all,
                destinations: const [
                  NavigationRailDestination(icon: Icon(Icons.dashboard_outlined), label: Text('Overview')),
                  NavigationRailDestination(icon: Icon(Icons.work_outline), label: Text('Vacancies')),
                  NavigationRailDestination(icon: Icon(Icons.badge_outlined), label: Text('My staff')),
                  NavigationRailDestination(icon: Icon(Icons.person_outline), label: Text('Account')),
                ],
              ),
              const VerticalDivider(width: 1),
              Expanded(child: content),
            ])
          : content),
        bottomNavigationBar: desktop ? null : NavigationBar(
          selectedIndex: section,
          onDestinationSelected: (v) => setState(() => section = v),
          destinations: destinations,
        ),
      );
    });
  }
}

class OverviewPanel extends StatefulWidget {
  final CaboApi api;
  final String name;
  const OverviewPanel({super.key, required this.api, required this.name});
  @override
  State<OverviewPanel> createState() => _OverviewPanelState();
}
class _OverviewPanelState extends State<OverviewPanel> {
  Map<String, dynamic>? summary;
  String? error;
  @override
  void initState() { super.initState(); _reload(); }

  Future<void> _reload() async {
    try {
      final data = await widget.api.overview();
      if (mounted) setState(() { summary = data; error = null; });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobs = summary?['jobs'];
    final applications = summary?['applications'];
    final counts = jobs is Map ? jobs : <String, dynamic>{};
    final pipeline = applications is Map ? applications : <String, dynamic>{};
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(padding: const EdgeInsets.all(22), children: [
        Text('Welcome, ${widget.name}', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        const Text('Human-led recruitment and people development, backed by evidence.'),
        const SizedBox(height: 23),
        if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        if (summary == null && error == null) const Center(child: CircularProgressIndicator.adaptive()),
        if (summary != null) ...[
          CountCard(label: 'Vacancies', value: '${counts['total'] ?? 0}', icon: Icons.work_outline),
          CountCard(label: 'Published roles', value: '${counts['published'] ?? 0}', icon: Icons.check_circle_outline),
          CountCard(label: 'Candidates', value: '${summary!['candidates'] ?? 0}', icon: Icons.people_outline),
          CountCard(label: 'Applications', value: '${pipeline['total'] ?? 0}', icon: Icons.description_outlined),
        ],
        const SizedBox(height: 15),
        const Text('CABO does not automatically hire, reject or promote people.'),
      ]),
    );
  }
}
class CountCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const CountCard({super.key, required this.label, required this.value, required this.icon});
  @override
  Widget build(BuildContext context) => Card(child: Padding(
    padding: const EdgeInsets.all(18),
    child: Row(children: [
      Icon(icon, color: Theme.of(context).colorScheme.primary),
      const SizedBox(width: 16),
      Expanded(child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
      Text(value, style: Theme.of(context).textTheme.titleLarge),
    ]),
  ));
}

class JobsPanel extends StatefulWidget {
  final CaboApi api;
  const JobsPanel({super.key, required this.api});
  @override
  State<JobsPanel> createState() => _JobsPanelState();
}
class _JobsPanelState extends State<JobsPanel> {
  List<Map<String, dynamic>>? jobs;
  String? error;
  @override
  void initState() { super.initState(); _reload(); }
  Future<void> _reload() async {
    try {
      final data = await widget.api.jobs();
      if (mounted) setState(() { jobs = data; error = null; });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _reload,
    child: ListView(padding: const EdgeInsets.all(18), children: [
      Text('Organization vacancies', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 10),
      if (jobs == null && error == null) const Center(child: CircularProgressIndicator.adaptive()),
      if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      if (jobs != null && jobs!.isEmpty) const Text('No vacancies yet.'),
      for (final job in jobs ?? <Map<String, dynamic>>[]) Card(
        child: ListTile(
          title: Text('${job['title'] ?? 'Vacancy'}'),
          subtitle: Text('${job['department'] ?? ''} · ${job['location'] ?? ''}\n${job['status'] ?? ''}'),
          isThreeLine: true,
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showDialog<void>(context: context,
            builder: (context) => AlertDialog(
              title: Text('${job['title'] ?? 'Vacancy'}'),
              content: SingleChildScrollView(
                child: Text('${job['description'] ?? ''}\n\n${job['criteria'] ?? ''}')),
              actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
            )),
        ),
      ),
    ]),
  );
}

class StaffPanel extends StatefulWidget {
  final CaboApi api;
  const StaffPanel({super.key, required this.api});
  @override
  State<StaffPanel> createState() => _StaffPanelState();
}
class _StaffPanelState extends State<StaffPanel> {
  Map<String, dynamic>? record;
  String? error;
  @override
  void initState() { super.initState(); _reload(); }
  Future<void> _reload() async {
    try {
      final data = await widget.api.staff();
      if (mounted) setState(() { record = data; error = null; });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }
  Widget group(String name, String key, String title, String subtitle) {
    final data = record?[key];
    if (data is! List || data.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 14),
      Text(name, style: Theme.of(context).textTheme.titleMedium),
      for (final item in data.whereType<Map>())
        Card(child: ListTile(
          title: Text('${item[title] ?? 'Recorded item'}'),
          subtitle: Text('${item[subtitle] ?? ''}'),
        )),
    ]);
  }
  Future<void> requestReview() async {
    final evidence = TextEditingController();
    final outcome = TextEditingController();
    String type = 'career_development';
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, refresh) => AlertDialog(
          title: const Text('Request a career review'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                value: type,
                items: const [
                  DropdownMenuItem(value: 'career_development', child: Text('Career development')),
                  DropdownMenuItem(value: 'promotion', child: Text('Promotion review')),
                  DropdownMenuItem(value: 'salary_review', child: Text('Salary review')),
                  DropdownMenuItem(value: 'performance_appeal', child: Text('Performance appeal')),
                ],
                onChanged: (v) => refresh(() => type = v ?? type),
              ),
              const SizedBox(height: 12),
              TextField(controller: evidence, minLines: 2, maxLines: 4,
                decoration: const InputDecoration(labelText: 'Evidence (20+ characters)')),
              const SizedBox(height: 12),
              TextField(controller: outcome, maxLines: 3,
                decoration: const InputDecoration(labelText: 'Requested outcome (10+ characters)')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (evidence.text.trim().length < 20 || outcome.text.trim().length < 10) return;
                Navigator.pop(dialogContext, {
                  'kind': type, 'evidenceSummary': evidence.text.trim(),
                  'requestedOutcome': outcome.text.trim(),
                });
              },
              child: const Text('Send to HR for review'),
            ),
          ],
        ),
      ),
    );
    evidence.dispose();
    outcome.dispose();
    if (result == null) return;
    try {
      await widget.api.request('/api/v1/employee/progression', method: 'POST', body: result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request sent for human HR review.')));
        await _reload();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')));
    }
  }
  @override
  Widget build(BuildContext context) {
    final employee = record?['employee'];
    return RefreshIndicator(onRefresh: _reload,
      child: ListView(padding: const EdgeInsets.all(18), children: [
        Text('My employment', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 10),
        if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        if (record != null && record!['linked'] != true)
          const Text('Ask HR to link your verified account before staff data becomes available.'),
        if (employee is Map) ...[
          Card(child: Column(children: [
            ListTile(title: Text('${employee['full_name'] ?? ''}'),
              subtitle: Text('${employee['employee_code'] ?? ''}')),
            ListTile(title: const Text('Job title'),
              subtitle: Text('${employee['job_title'] ?? ''}')),
            ListTile(title: const Text('Status'),
              subtitle: Text('${employee['employment_status'] ?? ''}')),
          ])),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: requestReview,
            icon: const Icon(Icons.rate_review_outlined),
            label: const Text('Request a career or salary review')),
          group('Your leave requests', 'leaves', 'leave_type', 'status'),
          group('Performance reviews', 'reviews', 'period_label', 'summary'),
          group('Development goals', 'plans', 'goal', 'status'),
          group('Career review cases', 'cases', 'kind', 'status'),
        ],
      ]),
    );
  }
}

class AccountPanel extends StatelessWidget {
  final Map<String, dynamic> profile;
  final Future<void> Function() onSignOut;
  const AccountPanel({super.key, required this.profile, required this.onSignOut});
  @override
  Widget build(BuildContext context) {
    final raw = profile['user'];
    final user = raw is Map ? raw : <String, dynamic>{};
    return ListView(padding: const EdgeInsets.all(22), children: [
      Text('Your account', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 14),
      Card(child: Column(children: [
        ListTile(title: const Text('Name'), subtitle: Text('${user['name'] ?? user['full_name'] ?? ''}')),
        ListTile(title: const Text('Email'), subtitle: Text('${user['email'] ?? ''}')),
        ListTile(title: const Text('Organization'), subtitle: Text('${profile['organization'] ?? ''}')),
        ListTile(title: const Text('Access level'), subtitle: Text('${profile['role'] ?? ''}')),
      ])),
      const SizedBox(height: 16),
      FilledButton.tonalIcon(
        onPressed: () { onSignOut(); },
        icon: const Icon(Icons.logout_outlined),
        label: const Text('Sign out'),
      ),
      const SizedBox(height: 16),
      const Text('CABO Solutions · Real people make employment decisions.'),
    ]);
  }
}
