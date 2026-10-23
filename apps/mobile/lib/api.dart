import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class CaboApiException implements Exception {
  final String message;
  final int status;
  const CaboApiException(this.message, this.status);
  @override
  String toString() => message;
}

class CaboApi {
  static const storage = FlutterSecureStorage();
  static const cookieKey = 'cabo_hc_session';
  final http.Client client;
  final Uri baseUri;
  String? _cookie;

  CaboApi({required this.baseUri, http.Client? client}) : client = client ?? http.Client() {
    if (baseUri.scheme != 'https' &&
        !(baseUri.scheme == 'http' &&
          (baseUri.host == 'localhost' || baseUri.host == '127.0.0.1'))) {
      throw ArgumentError('CABO requires HTTPS outside local development.');
    }
  }

  Future<void> restore() async {
    _cookie = await storage.read(key: cookieKey);
  }

  Future<dynamic> request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    if (!path.startsWith('/api/v1/')) {
      throw ArgumentError('Requests must use the CABO API.');
    }
    final uri = baseUri.resolve(path);
    final request = http.Request(method, uri);
    request.headers.addAll({
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (_cookie != null) 'Cookie': _cookie!,
    });
    if (body != null) request.body = jsonEncode(body);
    final response = await client.send(request).then(http.Response.fromStream);

    final setCookie = response.headers['set-cookie'];
    if (setCookie != null) {
      for (final part in setCookie.split(RegExp(r',(?=\s*cabo_session=)'))) {
        final match = RegExp(r'(?:^|\s)cabo_session=([^;]*)').firstMatch(part);
        if (match != null) {
          final cookieValue = match.group(1)!;
          if (cookieValue.isEmpty) {
            await clearLocal();
          } else {
            _cookie = 'cabo_session=$cookieValue';
            await storage.write(key: cookieKey, value: _cookie);
          }
        }
      }
    }
    if (response.statusCode == 204) return null;
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } catch (_) {
      throw CaboApiException('Invalid response from the CABO service.', response.statusCode);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw CaboApiException(
        data is Map && data['error'] is String
            ? data['error'] as String : 'Request failed.',
        response.statusCode,
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> signIn(String username, String password, String code) async {
    final data = await request('/api/v1/auth/login', method: 'POST', body: {
      'email': username.trim(), 'password': password,
      if (code.trim().isNotEmpty) 'otpCode': code.trim(),
    });
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> profile() async =>
    Map<String, dynamic>.from(await request('/api/v1/auth/me') as Map);

  Future<Map<String, dynamic>> overview() async =>
    Map<String, dynamic>.from(await request('/api/v1/overview') as Map);

  Future<List<Map<String, dynamic>>> jobs() async =>
    (await request('/api/v1/jobs') as List)
      .map((x) => Map<String, dynamic>.from(x as Map)).toList(growable: false);

  Future<Map<String, dynamic>> staff() async =>
    Map<String, dynamic>.from(await request('/api/v1/employee/me') as Map);

  Future<void> signOut() async {
    try { await request('/api/v1/auth/logout', method: 'POST'); }
    catch (_) { /* Network failure must not prevent local sign-out. */ }
    finally { await clearLocal(); }
  }

  Future<void> clearLocal() async {
    _cookie = null;
    await storage.delete(key: cookieKey);
  }

  void dispose() => client.close();
}
