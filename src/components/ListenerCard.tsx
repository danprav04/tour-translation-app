import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';

interface ListenerCardProps {
  id: string;
  name: string;
  joinedAt: string;
  onKick: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function ListenerCard({
  id,
  name,
  joinedAt,
  onKick,
  onRename,
}: ListenerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== name) {
      onRename(id, editName.trim());
    } else {
      setEditName(name);
    }
    setIsEditing(false);
  };

  const handleKick = () => {
    Alert.alert(
      'Disconnect Listener',
      `Remove "${name}" from the session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => onKick(id),
        },
      ]
    );
  };

  const timeSinceJoin = getTimeSince(joinedAt);

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.info}>
        {isEditing ? (
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            onBlur={handleRename}
            onSubmitEditing={handleRename}
            autoFocus
            selectTextOnFocus
            maxLength={20}
          />
        ) : (
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        )}
        <Text style={styles.time}>Joined {timeSinceJoin}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            setEditName(name);
            setIsEditing(true);
          }}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.actionIcon}>✏️</Text>
        </Pressable>
        <Pressable
          onPress={handleKick}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.kickBtn,
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <Text style={styles.actionIcon}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124,92,252,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#7C5CFC',
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  nameInput: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: '#00D4AA',
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  time: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickBtn: {
    backgroundColor: 'rgba(255,71,87,0.12)',
  },
  actionIcon: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
});
