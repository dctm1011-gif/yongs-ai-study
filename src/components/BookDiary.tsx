import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, set as dbSet, get, remove } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getKSTDateString(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${m}월 ${d}일`;
}

function makeBookId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function SearchableText({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\s+)/);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const word = part.trim();
        if (!word) return part;
        return (
          <Text
            key={i}
            onLongPress={() => {
              const clean = word.replace(/^["""''(.,!?;:]+|["""''().,!?;:]+$/g, '');
              if (clean) Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(clean)}`);
            }}
            {...{ delayLongPress: 400 } as any}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

const COVER_KEY = (id: string) => `bookCover_${id}`;

async function saveCoverToStorage(bookId: string, base64: string): Promise<void> {
  await AsyncStorage.setItem(COVER_KEY(bookId), `data:image/jpeg;base64,${base64}`);
}

async function loadCoverFromStorage(bookId: string): Promise<string | null> {
  return AsyncStorage.getItem(COVER_KEY(bookId));
}

interface BookInfo {
  id: string;
  title: string;
  totalPages: number;
  localCoverUri?: string | null; // 앱 세션 중 임시 미리보기용
  createdAt: string;
}

interface DayLog {
  endPage: number;
  note: string;
  savedAt: string;
}

// ─── 책 추가 모달 ─────────────────────────────────────────────────
interface AddBookModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (book: BookInfo) => void;
  uid: string;
}

function AddBookModal({ visible, onClose, onAdd, uid }: AddBookModalProps) {
  const [title, setTitle] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setTotalPages('');
    setCoverUri(null);
    setCoverBase64(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 3],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
      setCoverBase64(result.assets[0].base64 ?? null);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('입력 오류', '책 제목을 입력해주세요.'); return; }
    const pages = parseInt(totalPages, 10);
    if (!totalPages || isNaN(pages) || pages <= 0) { Alert.alert('입력 오류', '전체 페이지 수를 입력해주세요.'); return; }

    setSaving(true);
    try {
      const id = makeBookId();
      if (coverBase64) {
        await saveCoverToStorage(id, coverBase64);
      }
      const createdAt = new Date(Date.now() + 9 * 3600000).toISOString();
      await dbSet(
        ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${id}/info`),
        { title: title.trim(), totalPages: pages, hasCover: !!coverBase64, createdAt }
      );
      onAdd({ id, title: title.trim(), totalPages: pages, localCoverUri: coverUri, createdAt });
      reset();
      onClose();
    } catch (e) {
      Alert.alert('오류', '책 추가에 실패했습니다.');
      console.warn('책 추가 실패:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={add.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={add.sheet}>
          <View style={add.header}>
            <Text style={add.title}>책 추가</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* 표지 선택 */}
          <TouchableOpacity style={add.coverPicker} onPress={pickImage} activeOpacity={0.8}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={add.coverPreview} resizeMode="cover" />
            ) : (
              <View style={add.coverPlaceholder}>
                <MaterialIcons name="add-photo-alternate" size={32} color="#9ca3af" />
                <Text style={add.coverPlaceholderText}>표지 이미지 선택</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={add.label}>책 제목</Text>
          <TextInput
            style={add.input}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 홍학의 자리"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
            maxLength={60}
          />

          <Text style={add.label}>전체 페이지 수</Text>
          <TextInput
            style={add.input}
            value={totalPages}
            onChangeText={setTotalPages}
            keyboardType="number-pad"
            placeholder="예: 320"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            maxLength={5}
          />

          <TouchableOpacity
            style={[add.saveBtn, saving && add.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={add.saveBtnText}>추가하기</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── 책 다이어리 모달 ──────────────────────────────────────────────
interface BookDiaryModalProps {
  book: BookInfo | null;
  onClose: () => void;
}

function BookDiaryModal({ book, onClose }: BookDiaryModalProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const today = getKSTDateString();

  const [logs, setLogs] = useState<Record<string, DayLog>>({});
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [coverData, setCoverData] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(book?.totalPages ?? 0);
  const [editingTotal, setEditingTotal] = useState(false);
  const [newTotalInput, setNewTotalInput] = useState('');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editPageInput, setEditPageInput] = useState('');
  const [editNoteInput, setEditNoteInput] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [pageInput, setPageInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [todaySaved, setTodaySaved] = useState(false);
  const noteRef = useRef<TextInput>(null);
  const totalRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!book) return;
    const uri = book.localCoverUri ?? null;
    if (uri) { setCoverData(uri); return; }
    loadCoverFromStorage(book.id).then(setCoverData);
  }, [book?.id]);

  const loadLogs = useCallback(async () => {
    if (!uid || !book) return;
    setLoadingLogs(true);
    try {
      const snap = await get(
        ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${book.id}/logs`)
      );
      if (snap.exists()) {
        const data: Record<string, DayLog> = snap.val();
        setLogs(data);
        if (data[today]) {
          setPageInput(String(data[today].endPage));
          setNoteInput(data[today].note);
          setTodaySaved(true);
        } else {
          setPageInput('');
          setNoteInput('');
          setTodaySaved(false);
        }
      } else {
        setLogs({});
        setPageInput('');
        setNoteInput('');
        setTodaySaved(false);
      }
    } catch (e) {
      console.warn('독서 기록 로드 실패:', e);
    } finally {
      setLoadingLogs(false);
    }
  }, [uid, book, today]);

  useEffect(() => {
    if (book) loadLogs();
  }, [book, loadLogs]);

  const handleSave = useCallback(async () => {
    if (!book) return;
    const endPage = parseInt(pageInput, 10);
    if (!pageInput || isNaN(endPage) || endPage <= 0) {
      Alert.alert('입력 오류', '현재 읽은 페이지를 입력해주세요.');
      return;
    }
    if (endPage > book.totalPages) {
      Alert.alert('입력 오류', `전체 페이지(${book.totalPages}p)를 초과했습니다.`);
      return;
    }
    if (!noteInput.trim()) {
      Alert.alert('입력 오류', '감상을 한 줄 적어주세요.');
      return;
    }
    setSaving(true);
    try {
      const log: DayLog = {
        endPage,
        note: noteInput.trim(),
        savedAt: new Date(Date.now() + 9 * 3600000).toISOString(),
      };
      await dbSet(
        ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${book.id}/logs/${today}`),
        log
      );
      setLogs(prev => ({ ...prev, [today]: log }));
      setTodaySaved(true);
    } catch (e) {
      Alert.alert('오류', '저장에 실패했습니다.');
      console.warn('독서 기록 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [book, pageInput, noteInput, uid, today]);

  const startEditEntry = (date: string) => {
    setEditingDate(date);
    setEditPageInput(String(logs[date].endPage));
    setEditNoteInput(logs[date].note);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const handleEntryEdit = async () => {
    if (!book || !editingDate) return;
    const endPage = parseInt(editPageInput, 10);
    if (!editPageInput || isNaN(endPage) || endPage <= 0) {
      Alert.alert('입력 오류', '페이지 수를 확인해주세요.'); return;
    }
    if (!editNoteInput.trim()) {
      Alert.alert('입력 오류', '감상을 입력해주세요.'); return;
    }
    setEditSaving(true);
    try {
      const updated: DayLog = { endPage, note: editNoteInput.trim(), savedAt: logs[editingDate].savedAt };
      await dbSet(
        ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${book.id}/logs/${editingDate}`),
        updated
      );
      setLogs(prev => ({ ...prev, [editingDate]: updated }));
      setEditingDate(null);
    } catch {
      Alert.alert('오류', '수정에 실패했습니다.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleTotalPagesSave = async () => {
    if (!book) return;
    const val = parseInt(newTotalInput, 10);
    if (!newTotalInput || isNaN(val) || val <= 0) {
      Alert.alert('입력 오류', '올바른 페이지 수를 입력해주세요.');
      return;
    }
    try {
      await dbSet(
        ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${book.id}/info/totalPages`),
        val
      );
      setTotalPages(val);
      setEditingTotal(false);
    } catch {
      Alert.alert('오류', '수정에 실패했습니다.');
    }
  };

  if (!book) return null;

  const sortedDates = Object.keys(logs).sort((a, b) => b.localeCompare(a));
  const currentPage = sortedDates.length > 0 ? logs[sortedDates[0]].endPage : 0;
  const progress = totalPages > 0 ? currentPage / totalPages : 0;
  const percent = Math.round(progress * 100);

  return (
    <Modal visible={!!book} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={d.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'android' ? 30 : 0}>
          {/* 헤더 */}
          <View style={d.header}>
            <TouchableOpacity onPress={onClose} style={d.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            {coverData && (
              <Image source={{ uri: coverData }} style={d.headerCover} resizeMode="cover" />
            )}
            <View style={d.headerInfo}>
              <Text style={d.headerTitle} numberOfLines={2}>{book.title}</Text>
              {editingTotal ? (
                <View style={d.totalEditRow}>
                  <Text style={d.headerProgress}>{currentPage} / </Text>
                  <TextInput
                    ref={totalRef}
                    style={d.totalInput}
                    value={newTotalInput}
                    onChangeText={setNewTotalInput}
                    keyboardType="number-pad"
                    maxLength={5}
                    autoFocus
                    selectTextOnFocus
                  />
                  <Text style={d.headerProgress}>p</Text>
                  <TouchableOpacity onPress={handleTotalPagesSave} style={d.totalConfirmBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="check" size={16} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingTotal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={d.totalEditRow}
                  onPress={() => { setNewTotalInput(String(totalPages)); setEditingTotal(true); }}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={d.headerProgress}>{currentPage} / {totalPages}p  ({percent}%)</Text>
                  <MaterialIcons name="edit" size={13} color="#9ca3af" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
              <View style={d.progressBarBg}>
                <View style={[d.progressBarFill, { width: `${percent}%` }]} />
              </View>
            </View>
          </View>

          <ScrollView ref={scrollRef} style={d.scroll} contentContainerStyle={d.scrollContent} keyboardShouldPersistTaps="handled">
            {/* 오늘 기록 */}
            <View style={d.todayCard}>
              <Text style={d.todayLabel}>오늘 ({formatDate(today)})</Text>

              {todaySaved ? (
                <View>
                  <View style={d.savedRow}>
                    <MaterialIcons name="check-circle" size={18} color="#16a34a" />
                    <Text style={d.savedPage}>{logs[today]?.endPage}페이지까지 읽음</Text>
                  </View>
                  <SearchableText text={`"${logs[today]?.note}"`} style={d.savedNote} />
                  <TouchableOpacity style={d.editBtn} onPress={() => setTodaySaved(false)}>
                    <MaterialIcons name="edit" size={14} color="#6b7280" />
                    <Text style={d.editBtnText}>수정</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={d.inputLabel}>현재 페이지 (몇 페이지까지 읽었나요?)</Text>
                  <TextInput
                    style={d.pageInput}
                    value={pageInput}
                    onChangeText={setPageInput}
                    keyboardType="number-pad"
                    placeholder={`1 ~ ${book.totalPages}`}
                    placeholderTextColor="#9ca3af"
                    returnKeyType="next"
                    onSubmitEditing={() => noteRef.current?.focus()}
                    maxLength={5}
                  />
                  <Text style={d.inputLabel}>오늘의 감상</Text>
                  <TextInput
                    ref={noteRef}
                    style={d.noteInput}
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="짧게 한 줄로..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    maxLength={200}
                    blurOnSubmit={false}
                  />
                  <Text style={d.charCount}>{noteInput.length}/200</Text>
                  <TouchableOpacity
                    style={[d.saveBtn, saving && d.btnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><MaterialIcons name="save" size={18} color="#fff" /><Text style={d.saveBtnText}>기록 저장</Text></>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 독서 기록 */}
            <Text style={d.historyTitle}>독서 기록</Text>
            {loadingLogs ? (
              <ActivityIndicator color="#2563eb" style={{ marginTop: 20 }} />
            ) : sortedDates.length === 0 ? (
              <View style={d.emptyBox}>
                <Text style={d.emptyText}>아직 기록이 없어요{'\n'}첫 번째 감상을 남겨보세요 📖</Text>
              </View>
            ) : (
              sortedDates.map((date, i) => {
                const prev = sortedDates[i + 1];
                const prevPage = prev ? logs[prev].endPage : 0;
                const pagesRead = logs[date].endPage - prevPage;
                const isEditing = editingDate === date;
                return (
                  <View key={date} style={[d.entryCard, date === today && d.entryToday]}>
                    <View style={d.entryHeader}>
                      <Text style={d.entryDate}>{formatDate(date)}</Text>
                      {!isEditing ? (
                        <View style={d.entryBadgeRow}>
                          {pagesRead > 0 && (
                            <View style={d.readBadge}>
                              <Text style={d.readBadgeText}>+{pagesRead}p</Text>
                            </View>
                          )}
                          <View style={d.pageBadge}>
                            <Text style={d.pageBadgeText}>~{logs[date].endPage}p</Text>
                          </View>
                          <TouchableOpacity onPress={() => startEditEntry(date)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="edit" size={14} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={d.entryBadgeRow}>
                          <TouchableOpacity onPress={handleEntryEdit} disabled={editSaving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            {editSaving ? <ActivityIndicator size="small" color="#2563eb" /> : <MaterialIcons name="check" size={18} color="#2563eb" />}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingDate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="close" size={18} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {isEditing ? (
                      <View style={d.entryEditForm}>
                        <View style={d.entryEditRow}>
                          <Text style={d.entryEditLabel}>페이지</Text>
                          <TextInput
                            style={d.entryEditInput}
                            value={editPageInput}
                            onChangeText={setEditPageInput}
                            keyboardType="number-pad"
                            maxLength={5}
                            selectTextOnFocus
                          />
                        </View>
                        <Text style={d.entryEditLabel}>감상</Text>
                        <TextInput
                          style={d.entryEditNote}
                          value={editNoteInput}
                          onChangeText={setEditNoteInput}
                          multiline
                          maxLength={200}
                          blurOnSubmit={false}
                        />
                      </View>
                    ) : (
                      <SearchableText text={`"${logs[date].note}"`} style={d.entryNote} />
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

    </Modal>
  );
}

// ─── BookSection (culture.tsx에서 사용) ───────────────────────────
interface BookSectionProps {
  uid: string;
}

export function BookSection({ uid }: BookSectionProps) {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookInfo | null>(null);

  useEffect(() => {
    if (!uid) return;
    const loadBooks = async () => {
      try {
        const snap = await get(
          ref(getDatabase(getFirebaseApp()), `users/${uid}/books`)
        );
        if (snap.exists()) {
          const raw = snap.val() as Record<string, { info: Omit<BookInfo, 'id'> }>;
          const list: BookInfo[] = Object.entries(raw)
            .filter(([, v]) => v?.info)
            .map(([id, v]) => ({ id, ...v.info }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          setBooks(list);
        }
      } catch (e) {
        console.warn('책 목록 로드 실패:', e);
      } finally {
        setLoadingBooks(false);
      }
    };
    loadBooks();
  }, [uid]);

  const handleAdd = (book: BookInfo) => {
    setBooks(prev => [...prev, book]);
  };

  if (loadingBooks) {
    return <ActivityIndicator color="#2563eb" style={{ marginTop: 8 }} />;
  }

  return (
    <View>
      <Text style={bs.sectionLabel}>독서록</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bs.row}>
        {books.map(book => (
          <BookCard key={book.id} book={book} uid={uid} onPress={() => setSelectedBook(book)} />
        ))}
        <TouchableOpacity style={bs.addCard} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <MaterialIcons name="add" size={28} color="#2563eb" />
          <Text style={bs.addText}>책 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddBookModal visible={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} uid={uid} />
      <BookDiaryModal book={selectedBook} onClose={() => setSelectedBook(null)} />
    </View>
  );
}

// ─── 책 카드 (썸네일) ──────────────────────────────────────────────
interface BookCardProps {
  book: BookInfo;
  uid: string;
  onPress: () => void;
}

function BookCard({ book, uid, onPress }: BookCardProps) {
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [coverData, setCoverData] = useState<string | null>(book.localCoverUri ?? null);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const snap = await get(
          ref(getDatabase(getFirebaseApp()), `users/${uid}/books/${book.id}/logs`)
        );
        if (snap.exists()) {
          const logs: Record<string, DayLog> = snap.val();
          const latest = Object.keys(logs).sort().pop();
          if (latest) setCurrentPage(logs[latest].endPage);
        } else {
          setCurrentPage(0);
        }
      } catch {
        setCurrentPage(0);
      }
    };
    loadProgress();
    if (!book.localCoverUri) {
      loadCoverFromStorage(book.id).then(data => { if (data) setCoverData(data); });
    }
  }, [book.id, uid]);

  const progress = currentPage !== null && book.totalPages > 0
    ? currentPage / book.totalPages
    : 0;

  return (
    <TouchableOpacity style={bs.bookCard} onPress={onPress} activeOpacity={0.85}>
      {coverData ? (
        <Image source={{ uri: coverData }} style={bs.cover} resizeMode="cover" />
      ) : (
        <View style={[bs.cover, bs.coverPlaceholder]}>
          <MaterialIcons name="menu-book" size={24} color="#93c5fd" />
        </View>
      )}
      <Text style={bs.bookTitle} numberOfLines={2}>{book.title}</Text>
      <View style={bs.progressMini}>
        <View style={[bs.progressMiniFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={bs.progressText}>
        {currentPage !== null ? `${currentPage}/${book.totalPages}p` : '…'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── 스타일 ────────────────────────────────────────────────────────

const add = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  coverPicker: { alignSelf: 'center', marginBottom: 16 },
  coverPreview: { width: 100, height: 150, borderRadius: 8 },
  coverPlaceholder: {
    width: 100, height: 150, borderRadius: 8,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  coverPlaceholderText: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});

const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 12,
  },
  backBtn: { padding: 2 },
  headerCover: { width: 44, height: 66, borderRadius: 6 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  headerProgress: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  progressBarBg: { height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginTop: 4 },
  progressBarFill: { height: 4, backgroundColor: '#2563eb', borderRadius: 2, maxWidth: '100%' },
  totalEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  totalInput: {
    fontSize: 12, color: '#111827', borderBottomWidth: 1, borderBottomColor: '#2563eb',
    minWidth: 40, paddingVertical: 0, paddingHorizontal: 2, textAlign: 'center',
  },
  totalConfirmBtn: { marginLeft: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  todayCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  todayLabel: { fontSize: 12, fontWeight: '600', color: '#2563eb', marginBottom: 12, letterSpacing: 0.5 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  savedPage: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  savedNote: { fontSize: 14, color: '#374151', lineHeight: 20, fontStyle: 'italic' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-end' },
  editBtnText: { fontSize: 13, color: '#6b7280' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
  pageInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#111827',
    backgroundColor: '#f9fafb', marginBottom: 14,
  },
  noteInput: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
    backgroundColor: '#f9fafb', minHeight: 80, textAlignVertical: 'top',
  },
  charCount: { fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 4, marginBottom: 14 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 13, gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 28 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
  entryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#e5e7eb',
  },
  entryToday: { borderLeftColor: '#2563eb' },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  entryDate: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  entryBadgeRow: { flexDirection: 'row', gap: 4 },
  readBadge: { backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  readBadgeText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  pageBadge: { backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pageBadgeText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  entryNote: { fontSize: 14, color: '#374151', lineHeight: 20, fontStyle: 'italic' },
  entryEditForm: { marginTop: 8, gap: 6 },
  entryEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryEditLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 2 },
  entryEditInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb',
  },
  entryEditNote: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827',
    backgroundColor: '#f9fafb', minHeight: 60, textAlignVertical: 'top',
  },
});

const bs = StyleSheet.create({
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 10, marginTop: 4 },
  row: { paddingBottom: 4, gap: 10 },
  bookCard: { width: 96, alignItems: 'center' },
  cover: { width: 80, height: 110, borderRadius: 8, marginBottom: 6 },
  coverPlaceholder: { backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center', marginBottom: 4 },
  progressMini: { width: 80, height: 3, backgroundColor: '#e5e7eb', borderRadius: 2, marginBottom: 2 },
  progressMiniFill: { height: 3, backgroundColor: '#2563eb', borderRadius: 2, maxWidth: '100%' },
  progressText: { fontSize: 10, color: '#6b7280' },
  addCard: {
    width: 80, height: 110, borderRadius: 8, borderWidth: 2,
    borderColor: '#bfdbfe', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addText: { fontSize: 11, fontWeight: '600', color: '#2563eb' },
});
