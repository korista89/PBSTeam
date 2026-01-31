from pydantic import BaseModel, Field
from typing import Optional, Union

class BehaviorRecord(BaseModel):
    id: Optional[str] = Field(alias="번호")
    teacher: str = Field(alias="입력교사")
    student_name: str = Field(alias="학생명")
    student_code: str = Field(alias="코드번호")
    entry_date: str = Field(alias="입력일")
    incident_date: str = Field(alias="행동발생 날짜")
    time_period: str = Field(alias="시간대")
    location: str = Field(alias="장소")
    behavior_type: str = Field(alias="행동유형")
    frequency: Union[int, str] = Field(alias="발생빈도")
    duration: Union[int, str] = Field(alias="지속시간")
    intensity: Union[int, str] = Field(alias="강도")
    is_intervention: str = Field(alias="분리지도 여부")
    function: str = Field(alias="기능")

    class Config:
        populate_by_name = True
