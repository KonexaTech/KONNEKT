
import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator
} from 'react-native';

import { useAuth } from '../AuthContext';
import { supabase } from '../lib_supabase';
import { isConversationId } from '../services/conversationId';

export default function CreateGroupScreen({ navigation }) {
  const { user } = useAuth();

  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) {
      setBusy(false);
      return;
    }

    setBusy(true);
    setNotice('');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,username,full_name,avatar_url')
        .neq('id', user.id)
        .order('full_name')
        .limit(300);

      if (error) throw error;

      setPeople(data || []);
    } catch (error) {
      setNotice(
        error.message || 'Could not load members.'
      );
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = id => {
    setSelected(previous =>
      previous.includes(id)
        ? previous.filter(item => item !== id)
        : [...previous, id]
    );
  };

  const create = async () => {
    if (saveLock.current) return;
    if (!user?.id) {
      setNotice('Please sign in before creating a group.');
      return;
    }

    if (!name.trim()) {
      setNotice('Enter a group name.');
      return;
    }

    if (!selected.length) {
      setNotice('Choose at least one other member.');
      return;
    }

    if (selected.length > 99) {
      setNotice('A group can have up to 99 other members.');
      return;
    }

    saveLock.current = true;
    setSaving(true);
    setNotice('');

    try {
      const {
        data: conversationId,
        error
      } = await supabase.rpc(
        'konnekt_create_group_conversation',
        {
          group_title: name.trim(),
          group_description: description.trim(),
          member_ids: selected
        }
      );

      if (error) throw error;

      if (!isConversationId(conversationId)) {
        throw new Error(
          'Supabase did not return a valid group conversation ID.'
        );
      }

      navigation.replace('ChatConversation', {
        chatId: conversationId,
        chatName: name.trim()
      });
    } catch (error) {
      setNotice(
        error.message || 'Could not create the group.'
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const filtered = people.filter(person => {
    const searchText = `${person.full_name || ''} ${
      person.username || ''
    }`.toLowerCase();

    return searchText.includes(query.toLowerCase());
  });

  return (
    <View style={s.page}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={s.title}>Create group</Text>

        <TouchableOpacity
          onPress={create}
          disabled={saving}
        >
          <Text style={s.create}>
            {saving ? 'Creating…' : 'Create'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.form}>
        <Text style={s.label}>Group name</Text>

        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="Enter group name"
          placeholderTextColor="#BBA9CC"
        />

        <Text style={s.label}>
          Description (optional)
        </Text>

        <TextInput
          style={[s.input, s.multiline]}
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          placeholder="What is this group about?"
          placeholderTextColor="#BBA9CC"
        />

        <Text style={s.label}>
          Add members · {selected.length} selected
        </Text>

        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search members"
          placeholderTextColor="#BBA9CC"
        />
      </View>

      {busy ? (
        <ActivityIndicator
          color="#6A0DAD"
          style={{ marginTop: 20 }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={person => person.id}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);

            return (
              <TouchableOpacity
                style={s.person}
                onPress={() => toggle(item.id)}
                disabled={saving}
              >
                <View style={s.personCopy}>
                  <Text style={s.personName}>
                    {item.full_name || 'KONNEKT member'}
                  </Text>

                  <Text style={s.username}>
                    {item.username
                      ? `@${item.username}`
                      : 'Username not set'}
                  </Text>
                </View>

                <Text style={s.check}>
                  {isSelected ? '☑' : '□'}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={s.empty}>
              No other members found.
            </Text>
          }
        />
      )}

      {!!notice && (
        <Text style={s.notice}>{notice}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#05030A'
  },
  header: {
    padding: 17,
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#68408A'
  },
  back: {
    color: '#D8B8F5',
    fontSize: 16
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800'
  },
  create: {
    color: '#D8B8F5',
    fontSize: 15,
    fontWeight: '800'
  },
  form: {
    padding: 16
  },
  label: {
    color: '#C8D8EA',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 7,
    marginTop: 8
  },
  input: {
    backgroundColor: '#181025',
    borderColor: '#68408A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    color: '#FFF',
    marginBottom: 7
  },
  multiline: {
    minHeight: 65,
    textAlignVertical: 'top'
  },
  person: {
    marginHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: '#68408A',
    flexDirection: 'row',
    alignItems: 'center'
  },
  personCopy: {
    flex: 1
  },
  personName: {
    color: '#FFF',
    fontWeight: '700'
  },
  username: {
    color: '#D8B8F5',
    fontSize: 11,
    marginTop: 3
  },
  check: {
    color: '#D8B8F5',
    fontSize: 22
  },
  empty: {
    color: '#C4B4D0',
    textAlign: 'center',
    marginTop: 30
  },
  notice: {
    color: '#FFB6C0',
    padding: 16,
    lineHeight: 19
  }
});
