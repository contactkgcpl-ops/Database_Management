from sqlalchemy.orm import Session
from app.models import SystemSetting

def get_system_setting(db: Session, group: str, key: str, default: str = "") -> str:
    setting = db.query(SystemSetting).filter(
        SystemSetting.setting_group == group,
        SystemSetting.setting_key == key
    ).first()
    if not setting:
        setting = SystemSetting(setting_group=group, setting_key=key, setting_value=default)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting.setting_value or ""

def set_system_setting(db: Session, group: str, key: str, value: str):
    setting = db.query(SystemSetting).filter(
        SystemSetting.setting_group == group,
        SystemSetting.setting_key == key
    ).first()
    if not setting:
        setting = SystemSetting(setting_group=group, setting_key=key, setting_value=value)
        db.add(setting)
    else:
        setting.setting_value = value
    db.commit()
