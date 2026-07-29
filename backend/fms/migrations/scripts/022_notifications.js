// 022 — notification log and preferences.

module.exports = {
  id: '022_notifications',
  description: 'Create fms_notifications and fms_notificationprefs (P6.3, M19)',

  collections: ['fms_notifications', 'fms_notificationprefs'],
  dependsOn: ['001_core_collections'],

  async up(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const n of this.collections) {
      if (!existing.includes(n)) await db.createCollection(n);
    }

    await db.collection('fms_notifications').createIndexes([
      { key: { school: 1, recipient: 1, deliveryStatus: 1, createdAt: -1 }, name: 'school_recipient_status' },
      { key: { school: 1, event: 1, createdAt: -1 }, name: 'school_event_date' },
      { key: { school: 1, entity: 1, entityId: 1 }, name: 'school_entity' },
    ]);

    await db.collection('fms_notificationprefs').createIndexes([
      { key: { school: 1, user: 1, event: 1 }, name: 'school_user_event', unique: true },
    ]);
  },

  async down(db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    // The log is evidence of who was told; a rollback should not erase it
    // silently just because the feature is being removed.
    if (existing.includes('fms_notifications')) {
      const n = await db.collection('fms_notifications').countDocuments({});
      if (n > 0) {
        throw new Error(
          `Cannot roll back: ${n} notification record(s) exist and are evidence of ` +
          'who was informed of what.'
        );
      }
      await db.collection('fms_notifications').drop();
    }
    if (existing.includes('fms_notificationprefs')) {
      await db.collection('fms_notificationprefs').drop();
    }
  },
};