import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CaboApi {
  CaboApi({http.Client? client, FlutterSecureStorage? storage})
      : _client = client ?? http.Client(),
        _storage = storage ?? const FlutterSecureStorage();

  final http.Client _client;
  final FlutterSecureStorage _storage;
  static const apiBase = String.fromEnvironment('CABO_API_BASE_URL', defaultValue: '');

  Uri _uri(String path) {
    final uri = Uri.tryParse(apiBase);
    if (uri == null || uri.host.isEmpty ||
        (uri.scheme != 'https' && !(uri.scheme == 'http' &&
          (uri.host == 'localhost' || uri.host == '127.0.0.1')))) {
      throw StateError('Configure a secure CABO_API_BASE_URL before connecting.');
    }
    return uri.resolve('/api/v1' + path);
  }

  Future<Map<String, dynamic>> _request(String path,
      {String method = 'GET', Object? body, bool authenticated = true}) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (authenticated) {
      final session = await _storage.read(key: 'cabo_session');
      if (session == null || session.isEmpty) throw StateError('Please sign in.');
      headers['Cookie'] = session;
    }
    final request = http.Request(method, _uri(path))..headers.addAll(headers);
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(
      await _client.send(request).timeout(const Duration(seconds: 15)),
    ).timeout(const Duration(seconds: 15));
    final value = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final reason = value is Map ? value['error'] : null;
      throw StateError(reason is String ? reason : 'Request failed: ' + response.statusCode.toString());
    }
    if (path == '/auth/login') {
      final cookie = RegExp(r'cabo_session=[^;,\s]+')
          .firstMatch(response.headers['set-cookie'] ?? '')?.group(0);
      if (cookie == null) throw StateError('Server did not return a session.');
      await _storage.write(key: 'cabo_session', value: cookie);
    }
    return Map<String, dynamic>.from(value as Map);
  }

  Future<void> login(String email, String password, {String? otpCode}) async {
    await _request('/auth/login', method: 'POST', authenticated: false,
      body: {'email': email, 'password': password,
        if (otpCode != null && otpCode.isNotEmpty) 'otpCode': otpCode});
  }

  Future<Map<String, dynamic>> account() => _request('/auth/me');
  Future<Map<String, dynamic>> employee() => _request('/employee/me');
  Future<void> requestProgression(String kind, String evidence, String outcome) async {
    await _request('/employee/progression', method: 'POST',
      body: {'kind': kind, 'evidenceSummary': evidence, 'requestedOutcome': outcome});
  }

  Future<void> logout() async {
    try {
      await _request('/auth/logout', method: 'POST');
    } finally {
      await _storage.delete(key: 'cabo_session');
    }
  }

  void dispose() => _client.close();
}
