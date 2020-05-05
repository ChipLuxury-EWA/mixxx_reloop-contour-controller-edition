#pragma once

#include <QList>

#include "effects/backends/effectmanifest.h"

class QDomDocument;

class VisibleEffectsList : public QObject {
    Q_OBJECT

  public:
    const QList<EffectManifestPointer>& getList() const {
        return m_list;
    }
    const EffectManifestPointer at(int index) const;
    const EffectManifestPointer next(const EffectManifestPointer pManifest) const;
    const EffectManifestPointer previous(const EffectManifestPointer pManifest) const;

    void setList(const QList<EffectManifestPointer>& newList);
    void readEffectsXml(const QDomDocument& doc, EffectsBackendManagerPointer pBackendManager);
    void saveEffectsXml(QDomDocument* pDoc);

  signals:
    void visibleEffectsListChanged();

  private:
    QList<EffectManifestPointer> m_list;
};
