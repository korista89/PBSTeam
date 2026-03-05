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

class PictureWordRecord(BaseModel):
    id: int
    category: str
    word: str
    listener: bool = False
    mimicry: bool = False
    naming: bool = False
    matching: bool = False
    conversation: bool = False
    mand: bool = False
    total: int = 0
    consultation: Optional[str] = ""
    consultation_date: Optional[str] = ""

class PictureWordLesson(BaseModel):
    lesson_num: int
    domain: str
    vb_type: str
    subject: str
    goal: str
    lesson_date: Optional[str] = ""
    consultation: Optional[str] = ""
    consultation_date: Optional[str] = ""
    material1: Optional[str] = ""
    material2: Optional[str] = ""
    material3: Optional[str] = ""

class PictureWordOverview(BaseModel):
    student_name: str
    domain_progress: dict[str, int] # domain -> count of words learned (>0 VBs)
    total_learned: int

class PictureWordMinutes(BaseModel):
    date: str
    source: str
    type: str
    content: str
