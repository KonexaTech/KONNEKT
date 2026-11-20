import { Alert } from '../components/Alert';

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';

const sampleDocuments = [];

export default function DocumentPickerScreen({
  navigation,
  route,
}) {
  const contact = route?.params?.contact || {
    name: 'KONNEKT Contact',
  };

  const [search, setSearch] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);

  const [category, setCategory] = useState('All');

  const categories = ['All', 'PDF', 'Word', 'Excel', 'Other'];

  const filteredDocuments = sampleDocuments.filter((document) => {
    const matchesSearch = document.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory =
      category === 'All' || document.category === category;

    return matchesSearch && matchesCategory;
  });

  const sendDocument = () => {
    if (!selectedDocument) {
      Alert.alert('Select a document', 'Choose a document first.');
      return;
    }

    Alert.alert(
      'Demo selection',
      `${selectedDocument.name} selected for ${contact.name}. Real document sharing will be connected later.`,
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Share document</Text>
          <Text style={styles.headerSubtitle}>
            To {contact.name}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search documents..."
          placeholderTextColor="#98A2B3"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
      >
        {categories.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.categoryButton,
              category === item && styles.activeCategory,
            ]}
            onPress={() => setCategory(item)}
          >
            <Text
              style={[
                styles.categoryText,
                category === item && styles.activeCategoryText,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>
        AVAILABLE DOCUMENTS
      </Text>

      <ScrollView contentContainerStyle={styles.documentList}>
        {filteredDocuments.length === 0 ? (
          <Text style={styles.emptyText}>
            No matching documents found.
          </Text>
        ) : (
          filteredDocuments.map((document) => {
            const selected = selectedDocument?.id === document.id;

            return (
              <TouchableOpacity
                key={document.id}
                style={[
                  styles.documentCard,
                  selected && styles.selectedCard,
                ]}
                onPress={() => setSelectedDocument(document)}
              >
                <Text style={styles.documentIcon}>
                  {document.icon}
                </Text>

                <View style={styles.documentInfo}>
                  <Text style={styles.documentName}>
                    {document.name}
                  </Text>
                  <Text style={styles.documentDetails}>
                    {document.type} • {document.size}
                  </Text>
                </View>

                <Text style={styles.selection}>
                  {selected ? '✓' : '○'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text style={styles.selectionInfo}>
          {selectedDocument
            ? selectedDocument.name
            : 'No document selected'}
        </Text>

        <TouchableOpacity
          style={[
            styles.sendButton,
            !selectedDocument && styles.disabledButton,
          ]}
          onPress={sendDocument}
        >
          <Text style={styles.sendButtonText}>
            Send document →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05030A',
  },
  header: {
    backgroundColor: '#6A0DAD',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  back: {
    color: '#FFFFFF',
    fontSize: 32,
    marginRight: 15,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#D5EAE7',
    fontSize: 11,
    marginTop: 3,
  },
  searchContainer: {
    padding: 15,
  },
  searchInput: {
    backgroundColor: '#181025',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#FAF8FF',
    borderWidth: 1,
    borderColor: '#E8ECEF',
  },
  categoryScroll: {
    maxHeight: 48,
    paddingHorizontal: 10,
  },
  categoryButton: {
    backgroundColor: '#181025',
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 5,
    alignSelf: 'flex-start',
  },
  activeCategory: {
    backgroundColor: '#6A0DAD',
  },
  categoryText: {
    color: '#CBBBD9',
    fontSize: 12,
    fontWeight: '600',
  },
  activeCategoryText: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    color: '#CBBBD9',
    fontSize: 11,
    fontWeight: '800',
    marginHorizontal: 17,
    marginTop: 20,
    marginBottom: 10,
  },
  documentList: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  documentCard: {
    backgroundColor: '#181025',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECEF',
  },
  selectedCard: {
    borderColor: '#075E54',
    backgroundColor: '#EAF5F1',
  },
  documentIcon: {
    fontSize: 30,
    marginRight: 13,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    color: '#FAF8FF',
    fontSize: 13,
    fontWeight: '800',
  },
  documentDetails: {
    color: '#CBBBD9',
    fontSize: 11,
    marginTop: 5,
  },
  selection: {
    color: '#075E54',
    fontSize: 22,
    fontWeight: '800',
  },
  emptyText: {
    color: '#CBBBD9',
    textAlign: 'center',
    marginTop: 35,
  },
  bottomBar: {
    backgroundColor: '#181025',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#E8ECEF',
  },
  selectionInfo: {
    color: '#CBBBD9',
    fontSize: 11,
    marginBottom: 10,
  },
  sendButton: {
    backgroundColor: '#6A0DAD',
    padding: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
