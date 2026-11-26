from __future__ import annotations

from typing import TYPE_CHECKING, Literal, NotRequired, TypedDict

if TYPE_CHECKING:
    from ocp_tessellate.types import ColorLike


class ScriptRequest(TypedDict):
    script: str
    cwd: str
    sysPath: list[str]
    overridesPath: str | None
    geometrySummary: NotRequired[bool]


class ExportRequest(ScriptRequest):
    format: str
    output: str


class ShownObject(TypedDict):
    object: object
    name: str | None
    color: ColorLike | None
    alpha: float | None


class ShowOptions(TypedDict, total=False):
    color: ColorLike
    alpha: float


class EncodedBuffer(TypedDict):
    shape: list[int]
    dtype: str
    buffer: str
    codec: Literal['b64']


Quantity = Literal[
    'length', 'area', 'angle', 'point', 'direction', 'faces', 'label'
]
EdgeClass = Literal['seam', 'boundary', 'nonmanifold', 'tangent', 'feature']


class Fact(TypedDict):
    name: str
    quantity: Quantity
    value: float | list[float] | list[int] | str


class EntityFacts(TypedDict):
    ordinal: int
    type: str
    facts: list[Fact]


class InstanceFacts(TypedDict):
    faces: list[EntityFacts]
    edges: list[EntityFacts]
