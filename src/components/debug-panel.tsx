import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

interface DebugLog {
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

let debugLogs: DebugLog[] = [];
let logListeners: (() => void)[] = [];

export function addLog(level: 'log' | 'error' | 'warn' | 'info', message: string) {
  const log: DebugLog = {
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
  };
  debugLogs.unshift(log);
  if (debugLogs.length > 100) debugLogs.pop(); // 최대 100개 유지

  // 모든 리스너에 알림
  logListeners.forEach(listener => listener());
}

export function DebugPanel() {
  const [visible, setVisible] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);

  useEffect(() => {
    const listener = () => setLogs([...debugLogs]);
    logListeners.push(listener);
    return () => {
      logListeners = logListeners.filter(l => l !== listener);
    };
  }, []);

  if (!visible) {
    return (
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.fabText}>🐛</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🐛 Debug Panel</Text>
        <TouchableOpacity onPress={() => setVisible(false)}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logContainer}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No logs yet...</Text>
        ) : (
          logs.map((log, idx) => (
            <View
              key={idx}
              style={[
                styles.logLine,
                log.level === 'error' && styles.errorLine,
                log.level === 'warn' && styles.warnLine,
              ]}
            >
              <Text style={styles.timestamp}>{log.timestamp}</Text>
              <Text style={styles.level}>[{log.level.toUpperCase()}]</Text>
              <Text style={styles.message}>{log.message}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.clearBtn}
        onPress={() => {
          debugLogs = [];
          setLogs([]);
        }}
      >
        <Text style={styles.clearText}>Clear Logs</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  fabText: {
    fontSize: 24,
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    color: '#fff',
    fontSize: 20,
  },
  logContainer: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  logLine: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
  },
  errorLine: {
    borderLeftColor: '#ef4444',
  },
  warnLine: {
    borderLeftColor: '#f59e0b',
  },
  timestamp: {
    color: '#888',
    fontSize: 10,
    marginRight: 8,
    width: 60,
  },
  level: {
    color: '#0ea5e9',
    fontSize: 10,
    fontWeight: '700',
    marginRight: 8,
    width: 50,
  },
  message: {
    color: '#ccc',
    fontSize: 11,
    flex: 1,
  },
  emptyText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  clearBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    margin: 8,
    borderRadius: 6,
  },
  clearText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
