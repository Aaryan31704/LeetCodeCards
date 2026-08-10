import React, { useMemo } from 'react';
import {
  Modal,
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { C, fonts } from '../theme';

const KEYWORDS = new Set([
  'class', 'def', 'return', 'if', 'else', 'elif', 'for', 'while', 'in', 'not', 'and', 'or',
  'True', 'False', 'None', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'pass',
  'break', 'continue', 'yield', 'lambda', 'self', 'async', 'await',
  'function', 'const', 'let', 'var', 'new', 'this', 'typeof', 'null', 'undefined', 'true', 'false',
  'public', 'private', 'protected', 'static', 'void', 'int', 'string', 'bool', 'boolean',
  'package', 'interface', 'extends', 'implements', 'throw', 'throws', 'catch',
]);

function tokenize(code) {
  if (!code) return [{ type: 'plain', text: 'No code available.' }];
  const tokens = [];
  const re =
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+\.?\d*\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)|(\s+)|(.)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[1]) tokens.push({ type: 'comment', text: m[1] });
    else if (m[2]) tokens.push({ type: 'string', text: m[2] });
    else if (m[3]) tokens.push({ type: 'number', text: m[3] });
    else if (m[4]) tokens.push({ type: KEYWORDS.has(m[4]) ? 'keyword' : 'ident', text: m[4] });
    else if (m[5]) tokens.push({ type: 'plain', text: m[5] });
    else if (m[6]) tokens.push({ type: 'plain', text: m[6] });
  }
  return tokens;
}

const TOKEN_COLOR = {
  comment: '#64748b',
  string: '#86efac',
  number: '#fbbf24',
  keyword: '#7dd3fc',
  ident: '#e2e8f0',
  plain: '#cbd5e1',
};

export default function CodeModal({ visible, code, onClose, title = 'Your Code' }) {
  const tokens = useMemo(() => tokenize(code), [code]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text style={styles.code} selectable>
              {tokens.map((t, i) => (
                <Text key={i} style={{ color: TOKEN_COLOR[t.type] || TOKEN_COLOR.plain }}>
                  {t.text}
                </Text>
              ))}
            </Text>
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.codeBg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  title: { fontSize: 17, fontFamily: fonts.bold, color: C.codeText },
  closeBtn: { backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  closeText: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 14 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  code: { fontSize: 13, lineHeight: 20, fontFamily: mono },
});
