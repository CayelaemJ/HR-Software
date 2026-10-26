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
  Future<void> runEmployeeAction(Future<void> Function() action, String success) async {
    try {
      await action();
      if (!mounted) return;
      refresh();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }
  Future<void> withdrawLeave(Map leave) async {
    final approved = await showDialog<bool>(context: context, builder: (dialogContext) =>
      AlertDialog(title: const Text('Withdraw leave request?'),
        content: const Text('Only pending leave can be withdrawn. HR approvals are separate.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Keep request')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Withdraw'))
        ]));
    if (approved != true || !mounted) return;
    await runEmployeeAction(
      () => widget.api.withdrawPendingLeave(leave['id'].toString()),
      'Pending leave request withdrawn.');
  }
  Future<void> acknowledgeTask(Map task) async {
    final approved = await showDialog<bool>(context: context, builder: (dialogContext) =>
      AlertDialog(title: const Text('Acknowledge task receipt?'),
        content: const Text('This records receipt, not agreement or task completion. HR confirms completion separately.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Acknowledge'))
        ]));
    if (approved != true || !mounted) return;
    await runEmployeeAction(
      () => widget.api.acknowledgeOnboarding(task['id'].toString()),
      'Task receipt recorded. HR completion is separate.');
  }

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
      final leaves = (record['leaves'] as List? ?? []).cast<Map>();
      final tasks = (record['tasks'] as List? ?? []).cast<Map>();
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
            const SizedBox(height: 10),
            FilledButton.icon(onPressed: () => showDialog<void>(context: context, builder: (_) =>
              LeaveDialog(api: widget.api, onSubmitted: refresh)), icon: const Icon(Icons.event_available),
              label: const Text('Request leave')),
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
            const SizedBox(height: 20),
            Text('My leave', style: Theme.of(context).textTheme.titleLarge),
            if (leaves.isEmpty) const Text('No leave requests yet.'),
            ...leaves.map((e) => Card(child: ListTile(
              title: Text((e['leave_type'] ?? 'Leave').toString().replaceAll('_', ' ')),
              subtitle: Text((e['start_date'] ?? '').toString().substring(0, 10) +
                ' to ' + (e['end_date'] ?? '').toString().substring(0, 10) +
                ' · ' + (e['status'] ?? '').toString()),
              trailing: e['status'] == 'pending'
                ? IconButton(tooltip: 'Withdraw pending leave',icon: const Icon(Icons.cancel_outlined),
                    onPressed: () => withdrawLeave(e))
                : null,
            ))),
            const SizedBox(height: 20),
            Text('My onboarding tasks', style: Theme.of(context).textTheme.titleLarge),
            if (tasks.isEmpty) const Text('No onboarding tasks yet.'),
            ...tasks.map((e) => Card(child: ListTile(
              title: Text((e['title'] ?? '').toString()),
              subtitle: Text((e['category'] ?? '').toString() + ' · HR status: ' + (e['status'] ?? '').toString()),
              trailing: e['employee_acknowledged_at'] == null
                ? TextButton(onPressed: () => acknowledgeTask(e),
                    child: const Text('Acknowledge receipt'))
                : const Text('Received'),
            ))),
          ])),
        ),
      );
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

class LeaveDialog extends StatefulWidget {
  const LeaveDialog({required this.api,required this.onSubmitted,super.key});
  final CaboApi api;
  final VoidCallback onSubmitted;
  @override
  State<LeaveDialog> createState()=>_LeaveDialogState();
}
class _LeaveDialogState extends State<LeaveDialog> {
  final start=TextEditingController();
  final end=TextEditingController();
  final note=TextEditingController();
  String kind='annual';
  String? error;
  bool busy=false;

  @override
  void dispose(){start.dispose();end.dispose();note.dispose();super.dispose();}

  String isoDate(DateTime date) =>
    date.year.toString().padLeft(4,'0')+'-'+date.month.toString().padLeft(2,'0')+'-'+date.day.toString().padLeft(2,'0');

  Future<void> chooseDate(bool isStart) async {
    final today=DateTime.now();
    final picked=await showDatePicker(context:context,initialDate:today,
      firstDate:DateTime(2020),lastDate:DateTime(2100),
      helpText:isStart?'Leave starts':'Leave ends');
    if(picked==null || !mounted)return;
    setState((){if(isStart){start.text=isoDate(picked);}else{end.text=isoDate(picked);}});
  }

  Future<void> submit() async {
    final startDay=DateTime.tryParse(start.text),endDay=DateTime.tryParse(end.text);
    if(startDay==null||endDay==null||endDay.isBefore(startDay)){
      setState(()=>error='Select a valid start date and an end date on or after it.');
      return;
    }
    if(busy)return;
    setState((){busy=true;error=null;});
    try{
      await widget.api.requestLeave(kind,start.text,end.text,note:note.text.trim());
      if(mounted){Navigator.of(context).pop();widget.onSubmitted();}
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }

  @override
  Widget build(BuildContext context)=>AlertDialog(
    title:const Text('Request leave'),
    content:SizedBox(width:440,child:SingleChildScrollView(child:Column(
      mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        DropdownButtonFormField<String>(
          initialValue:kind,
          decoration:const InputDecoration(labelText:'Leave type'),
          items:const [
            DropdownMenuItem(value:'annual',child:Text('Annual')),
            DropdownMenuItem(value:'sick',child:Text('Sick')),
            DropdownMenuItem(value:'family_responsibility',child:Text('Family responsibility')),
            DropdownMenuItem(value:'study',child:Text('Study')),
            DropdownMenuItem(value:'unpaid',child:Text('Unpaid')),
            DropdownMenuItem(value:'other',child:Text('Other'))
          ],
          onChanged:busy?null:(v){if(v!=null)setState(()=>kind=v);}
        ),
        const SizedBox(height:12),
        TextField(controller:start,readOnly:true,
          decoration:const InputDecoration(labelText:'Start date',suffixIcon:Icon(Icons.calendar_month)),
          onTap:()=>chooseDate(true)),
        const SizedBox(height:12),
        TextField(controller:end,readOnly:true,
          decoration:const InputDecoration(labelText:'End date',suffixIcon:Icon(Icons.calendar_month)),
          onTap:()=>chooseDate(false)),
        const SizedBox(height:12),
        TextField(controller:note,maxLines:2,maxLength:1000,
          decoration:const InputDecoration(labelText:'Optional note (avoid medical details)')),
        const Text('HR must approve or reject the request. No leave is automatically granted.'),
        if(error!=null)Text(error!,style:const TextStyle(color:Colors.orangeAccent)),
      ]))),
    actions:[
      TextButton(onPressed:busy?null:()=>Navigator.of(context).pop(),child:const Text('Cancel')),
      FilledButton(onPressed:busy?null:submit,child:Text(busy?'Submitting…':'Request leave'))
    ],
  );
}
