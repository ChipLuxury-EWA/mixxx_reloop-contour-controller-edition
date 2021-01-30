#include "util/db/sqlite.h"

#include "util/assert.h"

namespace {

/// Date/time formate generated by SQLite CURRENT_TIMESTAMP (UTC) that is
/// used for library.last_played_at and PlalistTracks.pl_datetime_added.
/// QStringBuilder cannot be used to compose this constant at compile time!
const QString kGeneratedTimestampFormat =
        QStringLiteral("yyyy-MM-dd hh:mm:ss"); // date + separator + time
const QString kGeneratedTimestampDateFormat = QStringLiteral("yyyy-MM-dd");
const QString kGeneratedTimestampTimeFormat = QStringLiteral("hh:mm:ss");
const QChar kGeneratedTimestampDateTimeSeparator = QChar(' ');

} // namespace

namespace mixxx {

namespace sqlite {

QDateTime readGeneratedTimestamp(const QVariant& value) {
    DEBUG_ASSERT(kGeneratedTimestampFormat ==
            kGeneratedTimestampDateFormat +
                    kGeneratedTimestampDateTimeSeparator +
                    kGeneratedTimestampTimeFormat);
    const auto timestamp = value.toString();
    if (timestamp.isEmpty()) {
        return QDateTime();
    }
    const auto parts = timestamp.split(kGeneratedTimestampDateTimeSeparator);
    VERIFY_OR_DEBUG_ASSERT(parts.size() == 2) {
        return QDateTime();
    }
    const auto date = QDate::fromString(parts[0], kGeneratedTimestampDateFormat);
    VERIFY_OR_DEBUG_ASSERT(date.isValid()) {
        return QDateTime();
    }
    const auto time = QTime::fromString(parts[1], kGeneratedTimestampTimeFormat);
    VERIFY_OR_DEBUG_ASSERT(time.isValid()) {
        return QDateTime();
    }
    return QDateTime(date, time, Qt::UTC);
}

QVariant writeGeneratedTimestamp(const QDateTime& value) {
    return value.toUTC().toString(kGeneratedTimestampFormat);
}

} // namespace sqlite

} // namespace mixxx
